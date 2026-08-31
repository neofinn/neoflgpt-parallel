from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph

app = FastAPI(title="NeoFL TradingAgents Bridge", version="0.1.0")


class AnalyzeRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=32)
    trade_date: str
    asset_type: str = "stock"
    analysts: list[str] = Field(default_factory=lambda: ["market", "social", "news", "fundamentals"])


def _authorized(token: str | None) -> bool:
    expected = os.getenv("TRADINGAGENTS_BRIDGE_TOKEN")
    return not expected or token == expected


def _text(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


def _build_config() -> dict[str, Any]:
    config = DEFAULT_CONFIG.copy()
    config["results_dir"] = os.getenv("TRADINGAGENTS_RESULTS_DIR", config["results_dir"])
    config["data_cache_dir"] = os.getenv("TRADINGAGENTS_CACHE_DIR", config["data_cache_dir"])
    config["memory_log_path"] = os.getenv("TRADINGAGENTS_MEMORY_LOG_PATH", config["memory_log_path"])
    return config


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "tradingagents-bridge"}


@app.post("/analyze")
def analyze(request: AnalyzeRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = authorization.removeprefix("Bearer ") if authorization else None
    if not _authorized(token):
        raise HTTPException(status_code=401, detail="Unauthorized")

    allowed = {"market", "social", "news", "fundamentals"}
    analysts = [name for name in request.analysts if name in allowed]
    if not analysts:
        raise HTTPException(status_code=400, detail="At least one valid analyst is required")

    graph = TradingAgentsGraph(
        selected_analysts=tuple(analysts),
        debug=False,
        config=_build_config(),
    )
    final_state, signal = graph.propagate(
        request.ticker,
        request.trade_date,
        asset_type=request.asset_type,
    )

    return {
        "source": "TradingAgents",
        "ticker": request.ticker,
        "trade_date": request.trade_date,
        "asset_type": request.asset_type,
        "analysts": analysts,
        "signal": _text(signal),
        "final_trade_decision": _text(final_state.get("final_trade_decision")),
        "investment_plan": _text(final_state.get("investment_plan")),
        "market_report": _text(final_state.get("market_report")),
        "sentiment_report": _text(final_state.get("sentiment_report")),
        "news_report": _text(final_state.get("news_report")),
        "fundamentals_report": _text(final_state.get("fundamentals_report")),
    }
