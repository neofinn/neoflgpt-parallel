# NeoFLGPT Parallel

Agentic orchestration layer around the NeoFL Brain with TradingAgents as the execution engine.

## Architecture

```text
                         DASHBOARD
                            │
                connected API accounts
                    │               │
             DATA_ONLY           TRADING
                    │               │
                    └──────┬────────┘
                           ▼
                    NEOFLGPT AGENT
                           │
                           ▼
                      NEOFL BRAIN
                 independent analysis only
                           │
                     order intent
                           │
                           ▼
               TRADINGAGENTS EXECUTION
                           │
                 account-mode validation
                           │
                    broker/API adapter
                           │
                           ▼
                  selected TRADING account
                           │
                           ▼
                 actual order / fill state
                           │
                           ▼
                      NEOFL BRAIN
                       feedback loop
```

### Responsibilities

- **Dashboard:** connects API accounts and controls whether each account is `DATA_ONLY` or `TRADING`. It also selects which trading-enabled account is an execution destination.
- **DATA_ONLY account:** may supply permitted data for analysis but can never receive an order.
- **TRADING account:** may receive orders after account-mode verification and execution authorization.
- **NeoFL Brain:** analysis only. It observes data, reasons independently, produces the trading/order intent, and sends that intent to TradingAgents. It does not directly place broker orders.
- **TradingAgents:** execution engine. The integration wraps the upstream TradingAgents framework with an execution adapter that validates the order intent, resolves the selected dashboard account, submits through its broker API, and returns the actual execution result.
- **Alpaca:** supported broker/API execution path for connected Alpaca accounts. Account credentials are owned by the account gateway, not the browser or NeoFL Brain.
- **Feedback loop:** actual order, fill, position and account state is returned after execution and reconciled by NeoFL Brain before the next action.
- **MT5:** not used by this architecture.

## Account routing

See `docs/account-routing.md` for the dashboard/account gateway contract.

The critical invariant is:

```text
DATA_ONLY  ──X──> TradingAgents execution
TRADING    ─────> TradingAgents execution ─────> broker API
```

The execution engine re-checks the account mode immediately before submission. A data-only account cannot be traded merely because an order intent contains its ID.

## TradingAgents execution engine

`services/tradingagents_bridge` pins the upstream TradingAgents framework to commit `2448d0a12576f9b2ddcd5980a0630833423d1e1b` and exposes:

- `GET /health`
- `POST /execute`

`POST /execute` accepts an order intent from NeoFL Brain, requests an execution context for the selected `account_id` from the dashboard account gateway, rejects `DATA_ONLY`, and submits eligible Alpaca orders through the broker API.

The upstream TradingAgents project is an agentic research framework, so this repository's execution service is the execution adapter around it; the broker API remains the actual order venue.

## Environment

```text
OPENAI_API_KEY=...
BRAIN_URL=https://<actual-brain-host>
BRAIN_TOKEN=<optional>
ADMIN_GATEWAY_URL=https://<admin-host>
ADMIN_GATEWAY_TOKEN=<connection-scoped-token>

# Dashboard account gateway
ACCOUNT_GATEWAY_URL=https://<account-gateway-host>
ACCOUNT_GATEWAY_TOKEN=<service-token>

# Alpaca MCP for authoritative data/account visibility in NeoFLGPT
ALPACA_MCP_ENABLED=true
ALPACA_API_KEY=<alpaca-api-key>
ALPACA_SECRET_KEY=<alpaca-secret-key>
ALPACA_TOOLSETS=account,trading,stock-data,options-data,crypto-data
ALPACA_MCP_COMMAND=uvx
ALPACA_MCP_TIMEOUT_MS=20000

# TradingAgents execution service
TRADINGAGENTS_URL=http://tradingagents:8000
TRADINGAGENTS_TOKEN=<execution-service-token>
TRADINGAGENTS_BRIDGE_TOKEN=<execution-service-token>
ALPACA_EXECUTION_TIMEOUT_MS=30000

AGENT_MODE=observe
ALLOW_EXECUTION=false
REQUIRE_ADMIN_AUTH=true
MAX_TOOL_CALLS_PER_TURN=12
PORT=3000
```

Never commit API credentials. The dashboard/account gateway should keep broker secrets server-side and provide execution credentials or short-lived execution context only to the private execution service.

## Private Tailnet deployment

The intended deployment is a private Tailscale tailnet. The services are kept off the public internet and the NeoFL dashboard/runtime is exposed through Tailscale Serve.

```bash
docker compose -f docker-compose.tailnet.yml up -d --build
tailscale serve --bg 3000
tailscale serve status
```

Do not use Tailscale Funnel for the trading runtime.
