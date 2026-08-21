# NeoFL MT5 Agentic Link

This is the terminal-side MCP link for NeoFLGPT Parallel. Run it on the same Windows machine as the MetaTrader 5 terminal. It exposes the already logged-in MT5 account as a Streamable HTTP MCP server.

MetaTrader 5 added native MCP/agentic support in Build 6060 and later expanded MCP methods in Build 6090. This link is a deployable terminal-side fallback/bridge using the official MetaTrader5 Python integration, so the NeoFL agent can use one stable MCP contract even when the native terminal MCP configuration is not yet exposed to the remote agent. MetaQuotes documents external MCP-compatible agents and terminal trading/data capabilities. citeturn0search0turn2search0

## What it provides

- `get_account`
- `list_symbols` — complete broker-visible universe
- `get_tick`
- `get_rates`
- `get_positions`
- `get_orders`
- `get_history`
- `place_market_order`
- `close_position`
- `cancel_order`

The order tools call the logged-in MT5 terminal directly. There is no NeoFL REST/EA handshake in this path.

## Install on the MT5 Windows machine

1. Keep MetaTrader 5 open and logged into the intended account.
2. Ensure algorithmic trading is enabled in MT5.
3. Install Python 3.10+.
4. Open PowerShell in this directory.
5. Set a strong token:

```powershell
$env:NEOFL_MT5_MCP_TOKEN = 'PUT-A-LONG-RANDOM-TOKEN-HERE'
$env:NEOFL_MT5_MCP_HOST = '127.0.0.1'
$env:NEOFL_MT5_MCP_PORT = '8765'
```

6. Run:

```powershell
.\start.ps1
```

The local MCP endpoint is:

```text
http://127.0.0.1:8765/mcp
```

## Connect NeoFLGPT Parallel

Set the agent runtime environment:

```text
MCP_URL=http://127.0.0.1:8765/mcp
MCP_NAME=NeoFL MT5 Live Terminal
```

The existing NeoFLGPT Parallel runtime uses OpenAI Agents SDK `MCPServerStreamableHttp`, which is the recommended transport for controlled remote/local MCP servers. citeturn3search2

## Remote connection

If the Brain is hosted remotely, do **not** expose port 8765 directly to the Internet. Put this local endpoint behind an authenticated private tunnel or reverse proxy. The public/canonical NeoFL hostname should terminate at the authenticated relay, then forward privately to this local MCP endpoint.

Do not put broker passwords or API keys in GitHub. MT5 remains logged into the broker terminal locally.

## Live execution

This link intentionally exposes real trading operations because it is the execution-side MCP interface for the NeoFL agent. The Brain should inspect account state, symbol constraints, positions and current market data before acting. MT5 remains responsible for broker-level validation and returns the actual execution result to the Brain.

Start with the terminal/account you intend to operate and verify the tool list and account state before allowing autonomous order calls.
