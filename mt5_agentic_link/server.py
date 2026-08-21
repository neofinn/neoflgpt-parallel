"""NeoFL MT5 Agentic Link.

Runs on the same Windows machine as MetaTrader 5 and exposes the logged-in
terminal as a Streamable HTTP MCP server. The NeoFL agent connects to this
server and can read live account/market state and submit trading operations
through the terminal's existing session.

No broker password is stored here: MetaTrader 5 must already be logged in.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5
from fastmcp import FastMCP

mcp = FastMCP("NeoFL MT5 Agentic Link")
TOKEN = os.getenv("NEOFL_MT5_MCP_TOKEN", "")


def _auth(token: str | None) -> None:
    if TOKEN and token != TOKEN:
        raise PermissionError("invalid NeoFL MT5 MCP token")


def _ensure() -> None:
    if not mt5.initialize():
        code, message = mt5.last_error()
        raise RuntimeError(f"MT5 initialize failed: {code} {message}")


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


@mcp.tool()
def get_account(token: str | None = None) -> dict[str, Any]:
    """Return live MT5 account state."""
    _auth(token); _ensure()
    info = mt5.account_info()
    if info is None:
        raise RuntimeError(f"account_info failed: {mt5.last_error()}")
    return {"timestamp": _utc(), **info._asdict()}


@mcp.tool()
def list_symbols(token: str | None = None) -> dict[str, Any]:
    """Return the complete broker symbol universe visible to this terminal."""
    _auth(token); _ensure()
    symbols = mt5.symbols_get()
    if symbols is None:
        raise RuntimeError(f"symbols_get failed: {mt5.last_error()}")
    return {"timestamp": _utc(), "count": len(symbols), "symbols": [s.name for s in symbols]}


@mcp.tool()
def get_tick(symbol: str, token: str | None = None) -> dict[str, Any]:
    """Return the current live tick for a symbol."""
    _auth(token); _ensure()
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise RuntimeError(f"tick unavailable for {symbol}: {mt5.last_error()}")
    return {"timestamp": _utc(), "symbol": symbol, **tick._asdict()}


@mcp.tool()
def get_rates(symbol: str, timeframe: str = "M5", count: int = 200, token: str | None = None) -> dict[str, Any]:
    """Return recent OHLCV bars from the live MT5 terminal."""
    _auth(token); _ensure()
    tf = getattr(mt5, f"TIMEFRAME_{timeframe.upper()}", None)
    if tf is None:
        raise ValueError(f"unsupported timeframe: {timeframe}")
    count = max(1, min(int(count), 5000))
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
    if rates is None:
        raise RuntimeError(f"rates unavailable for {symbol}: {mt5.last_error()}")
    return {"timestamp": _utc(), "symbol": symbol, "timeframe": timeframe.upper(), "count": len(rates), "rates": rates.tolist()}


@mcp.tool()
def get_positions(token: str | None = None) -> dict[str, Any]:
    """Return all currently open positions on the connected account."""
    _auth(token); _ensure()
    positions = mt5.positions_get()
    if positions is None:
        positions = []
    return {"timestamp": _utc(), "count": len(positions), "positions": [p._asdict() for p in positions]}


@mcp.tool()
def get_orders(token: str | None = None) -> dict[str, Any]:
    """Return all currently active pending orders."""
    _auth(token); _ensure()
    orders = mt5.orders_get()
    if orders is None:
        orders = []
    return {"timestamp": _utc(), "count": len(orders), "orders": [o._asdict() for o in orders]}


@mcp.tool()
def get_history(days: int = 7, token: str | None = None) -> dict[str, Any]:
    """Return recent deal history."""
    _auth(token); _ensure()
    import datetime as dt
    end = dt.datetime.now()
    start = end - dt.timedelta(days=max(1, min(int(days), 90)))
    deals = mt5.history_deals_get(start, end)
    if deals is None:
        deals = []
    return {"timestamp": _utc(), "count": len(deals), "deals": [d._asdict() for d in deals]}


def _send(request: dict[str, Any]) -> dict[str, Any]:
    _ensure()
    result = mt5.order_send(request)
    if result is None:
        raise RuntimeError(f"order_send failed: {mt5.last_error()}")
    return {"timestamp": _utc(), **result._asdict()}


@mcp.tool()
def place_market_order(symbol: str, side: str, volume: float, stop_loss: float = 0.0, take_profit: float = 0.0, comment: str = "NeoFL Agentic", token: str | None = None) -> dict[str, Any]:
    """Execute a live market order through the connected MT5 terminal."""
    _auth(token); _ensure()
    side = side.upper()
    if side not in {"BUY", "SELL"}:
        raise ValueError("side must be BUY or SELL")
    info = mt5.symbol_info(symbol)
    tick = mt5.symbol_info_tick(symbol)
    if info is None or tick is None:
        raise RuntimeError(f"symbol/tick unavailable: {symbol}")
    if not info.visible:
        mt5.symbol_select(symbol, True)
    price = tick.ask if side == "BUY" else tick.bid
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(volume),
        "type": mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL,
        "price": price,
        "sl": float(stop_loss) if stop_loss else 0.0,
        "tp": float(take_profit) if take_profit else 0.0,
        "deviation": 20,
        "magic": 26082101,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_RETURN,
    }
    return _send(request)


@mcp.tool()
def close_position(ticket: int, volume: float = 0.0, token: str | None = None) -> dict[str, Any]:
    """Close an open position, fully by default or partially when volume is supplied."""
    _auth(token); _ensure()
    positions = mt5.positions_get(ticket=int(ticket))
    if not positions:
        raise ValueError(f"position not found: {ticket}")
    p = positions[0]
    tick = mt5.symbol_info_tick(p.symbol)
    if tick is None:
        raise RuntimeError(f"tick unavailable: {p.symbol}")
    close_volume = float(volume) if volume else float(p.volume)
    close_type = mt5.ORDER_TYPE_SELL if p.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
    price = tick.bid if p.type == mt5.POSITION_TYPE_BUY else tick.ask
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": p.symbol,
        "volume": close_volume,
        "type": close_type,
        "position": int(ticket),
        "price": price,
        "deviation": 20,
        "magic": 26082101,
        "comment": "NeoFL Agentic Close",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_RETURN,
    }
    return _send(request)


@mcp.tool()
def cancel_order(ticket: int, token: str | None = None) -> dict[str, Any]:
    """Cancel a pending MT5 order."""
    _auth(token); _ensure()
    request = {"action": mt5.TRADE_ACTION_REMOVE, "order": int(ticket), "magic": 26082101}
    return _send(request)


if __name__ == "__main__":
    host = os.getenv("NEOFL_MT5_MCP_HOST", "127.0.0.1")
    port = int(os.getenv("NEOFL_MT5_MCP_PORT", "8765"))
    mcp.run(transport="streamable-http", host=host, port=port)
