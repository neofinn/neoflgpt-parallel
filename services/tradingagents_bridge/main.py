from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="NeoFL TradingAgents Execution Engine", version="0.3.0")


class OrderRequest(BaseModel):
    account_id: str = Field(min_length=1)
    symbol: str = Field(min_length=1, max_length=64)
    side: str
    quantity: float = Field(gt=0)
    order_type: str = "market"
    limit_price: float | None = Field(default=None, gt=0)
    stop_price: float | None = Field(default=None, gt=0)
    time_in_force: str = "day"
    client_order_id: str | None = None
    brain_reason: str | None = None
    source: str = "NeoFL Brain"
    execution_engine: str = "TradingAgents"


def _authorized(token: str | None) -> bool:
    expected = os.getenv("TRADINGAGENTS_BRIDGE_TOKEN")
    return not expected or token == expected


def _json_request(url: str, payload: dict[str, Any], token: str | None = None, timeout: int = 30) -> dict[str, Any]:
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    request = Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        raise HTTPException(status_code=502, detail=f"Upstream request failed ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {exc.reason}") from exc


def _account_execution_context(account_id: str) -> dict[str, Any]:
    base = os.getenv("ACCOUNT_GATEWAY_URL")
    if not base:
        raise HTTPException(status_code=503, detail="ACCOUNT_GATEWAY_URL is not configured")
    return _json_request(
        f"{base.rstrip('/')}/accounts/execution-context",
        {"account_id": account_id},
        os.getenv("ACCOUNT_GATEWAY_TOKEN"),
    )


def _alpaca_request(context: dict[str, Any], order: OrderRequest) -> dict[str, Any]:
    if context.get("provider") != "alpaca":
        raise HTTPException(status_code=400, detail="Account is not an Alpaca account")
    api_key = context.get("api_key")
    secret_key = context.get("secret_key")
    if not api_key or not secret_key:
        raise HTTPException(status_code=502, detail="Account gateway did not return Alpaca execution credentials")

    base = str(context.get("trading_base_url") or "https://api.alpaca.markets").rstrip("/")
    payload: dict[str, Any] = {
        "symbol": order.symbol,
        "qty": order.quantity,
        "side": order.side,
        "type": order.order_type,
        "time_in_force": order.time_in_force,
    }
    if order.limit_price is not None:
        payload["limit_price"] = order.limit_price
    if order.stop_price is not None:
        payload["stop_price"] = order.stop_price
    if order.client_order_id:
        payload["client_order_id"] = order.client_order_id

    request = Request(
        f"{base}/v2/orders",
        data=json.dumps(payload).encode(),
        headers={
            "content-type": "application/json",
            "APCA-API-KEY-ID": str(api_key),
            "APCA-API-SECRET-KEY": str(secret_key),
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=int(os.getenv("ALPACA_EXECUTION_TIMEOUT_MS", "30000")) / 1000) as response:
            return json.loads(response.read().decode())
    except HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:1000]
        raise HTTPException(status_code=502, detail=f"Alpaca order rejected/upstream error ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"Alpaca execution failed: {exc.reason}") from exc


def _dhan_request(context: dict[str, Any], order: OrderRequest) -> dict[str, Any]:
    if context.get("provider") != "dhan":
        raise HTTPException(status_code=400, detail="Account is not a Dhan account")

    access_token = context.get("access_token")
    client_id = context.get("client_id") or context.get("dhan_client_id")
    security_id = context.get("security_id")
    exchange_segment = context.get("exchange_segment")
    if not access_token or not client_id:
        raise HTTPException(status_code=502, detail="Account gateway did not return Dhan execution context")
    if not security_id or not exchange_segment:
        raise HTTPException(status_code=400, detail="Dhan instrument mapping requires security_id and exchange_segment")

    order_type = {
        "market": "MARKET",
        "limit": "LIMIT",
        "stop": "STOP_LOSS_MARKET",
        "stop_limit": "STOP_LOSS",
    }[order.order_type]
    payload: dict[str, Any] = {
        "dhanClientId": str(client_id),
        "correlationId": order.client_order_id or f"neofl-{order.account_id}-{os.urandom(6).hex()}",
        "transactionType": "BUY" if order.side == "buy" else "SELL",
        "exchangeSegment": str(exchange_segment),
        "productType": str(context.get("product_type") or "INTRADAY"),
        "orderType": order_type,
        "validity": "IOC" if order.time_in_force == "ioc" else "DAY",
        "securityId": str(security_id),
        "quantity": int(order.quantity) if order.quantity.is_integer() else order.quantity,
        "disclosedQuantity": "",
        "price": order.limit_price or "",
        "triggerPrice": order.stop_price or "",
        "afterMarketOrder": False,
        "amoTime": "",
    }

    base = str(context.get("trading_base_url") or "https://api.dhan.co/v2").rstrip("/")
    request = Request(
        f"{base}/orders",
        data=json.dumps(payload).encode(),
        headers={
            "content-type": "application/json",
            "access-token": str(access_token),
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=int(os.getenv("DHAN_EXECUTION_TIMEOUT_MS", "30000")) / 1000) as response:
            return json.loads(response.read().decode())
    except HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:1000]
        raise HTTPException(status_code=502, detail=f"Dhan order rejected/upstream error ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"Dhan execution failed: {exc.reason}") from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "tradingagents-execution-engine"}


@app.post("/execute")
def execute(request: OrderRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = authorization.removeprefix("Bearer ") if authorization else None
    if not _authorized(token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if request.side not in {"buy", "sell"}:
        raise HTTPException(status_code=400, detail="side must be buy or sell")
    if request.order_type not in {"market", "limit", "stop", "stop_limit"}:
        raise HTTPException(status_code=400, detail="Unsupported order type")

    context = _account_execution_context(request.account_id)
    if context.get("mode") != "TRADING":
        raise HTTPException(status_code=403, detail="Account is DATA_ONLY; order blocked")

    provider = context.get("provider")
    if provider == "alpaca":
        result = _alpaca_request(context, request)
    elif provider == "dhan":
        result = _dhan_request(context, request)
    elif provider == "mt5":
        raise HTTPException(status_code=403, detail="MT5 accounts are data-only; execution is permanently disabled")
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported execution provider: {provider}")

    return {
        "accepted": True,
        "engine": "TradingAgents",
        "source": "NeoFL Brain",
        "account_id": request.account_id,
        "broker": provider,
        "order": result,
        "brain_reason": request.brain_reason,
    }
