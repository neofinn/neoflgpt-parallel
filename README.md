# NeoFLGPT Parallel

Agentic orchestration layer around the NeoFL Brain engine, integrated with TradingAgents and a multi-broker account gateway.

## Architecture

```text
                         DASHBOARD
                            |
                  ACCOUNT CONNECTIONS
                            |
          +-----------------+------------------+
          |                 |                  |
       ALPACA              DHAN               MT5
     DATA/TRADING       DATA/TRADING        DATA ONLY
          |                 |                  |
          +-----------------+------------------+
                            |
                       NEOFL BRAIN
                         ANALYSIS
                            |
                       ORDER INTENT
                            |
                     TRADINGAGENTS
                    EXECUTION ENGINE
                            |
                 account mode / auth gate
                            |
                 +----------+----------+
                 |                     |
              ALPACA                 DHAN
              trading                trading
                 |                     |
                 +----------+----------+
                            |
                      actual broker
                      order / fill
                            |
                       feedback
                            |
                       NEOFL BRAIN
```

### Account model

The dashboard is the account-control surface. Each connected account has a provider, account identifier, connection status, and explicit mode:

- `DATA_ONLY`: market/account information can be read and displayed, but no order may be submitted.
- `TRADING`: the account may be selected by TradingAgents for execution, subject to authorization and policy checks.

Supported providers:

- **Alpaca:** `DATA_ONLY` or `TRADING`.
- **Dhan:** `DATA_ONLY` or `TRADING`.
- **MT5:** permanently `DATA_ONLY` in this runtime. MT5 account information is visible in the dashboard, but there is no MT5 execution path.

### Dhan integration

DhanHQ provides a first-party MCP server at `https://mcp.dhan.co/mcp` for MCP-compatible clients. Its documentation describes both read and trade capabilities with per-session permissions/consent. The platform also exposes Trading APIs for orders, portfolio, market data and live feeds. urlDhanHQ MCP documentationhttps://docs.dhanhq.co/mcp/

In this architecture, Dhan is a normal connected account provider. The dashboard controls whether a Dhan account is `DATA_ONLY` or `TRADING`. NeoFL Brain never receives direct Dhan order-placement capability. A Dhan `TRADING` order is sent to **TradingAgents**, which performs the deterministic broker execution through the account's Dhan execution context.

Dhan's API uses an access token for authenticated requests; Dhan also supports API-key/consent authentication for programmatic integrations. citeturn0search0turn1search10

### Responsibility split

- **NeoFL Brain:** analysis only. It consumes normalized market/account observations, performs its own reasoning, and emits an order intent. It does not directly submit broker orders.
- **TradingAgents:** execution engine. It receives the Brain order intent, validates the selected account and permissions, submits the order through the selected broker adapter, and returns the actual broker response.
- **Dashboard:** manages connected accounts, account mode, connection state, and account/position/order display. Broker secrets stay server-side.
- **MT5 adapter:** read-only account/data adapter for dashboard visibility. It has no order-placement capability.
- **Alpaca adapter:** execution and data for Alpaca accounts.
- **Dhan adapter:** execution and data for Dhan accounts. Dhan's official APIs support order placement, modification/cancellation, portfolio/positions and market data. citeturn0search1turn0search4
- **Feedback:** actual broker/order/fill/account state is reconciled and returned to NeoFL Brain before subsequent decisions.

## Dashboard account API

- `GET /api/dashboard/accounts` — list connected accounts and provider/mode metadata.
- `GET /api/dashboard/accounts/{accountId}` — generic account details.
- `GET /api/dashboard/accounts/{accountId}/dhan` — Dhan account details.
- `GET /api/dashboard/accounts/{accountId}/mt5` — MT5 account details.

Credentials are never returned to the browser.

## Execution rules

```text
DATA_ONLY account  -> execution request -> HARD BLOCK
TRADING Alpaca     -> TradingAgents -> Alpaca
TRADING Dhan       -> TradingAgents -> Dhan
MT5 account        -> execution request -> HARD BLOCK
NeoFL Brain        -> NEVER direct broker execution
```

### Dhan MCP boundary

The Dhan MCP endpoint may be used as an optional broker/account connector, but any trade-capable Dhan MCP session must remain behind the TradingAgents execution boundary. Do **not** attach a trade-capable Dhan MCP directly to NeoFL Brain, because that would bypass the required Brain → TradingAgents execution architecture.

## Private Tailnet deployment

The intended deployment is a private Tailscale tailnet. The service is bound to localhost and exposed to authorized tailnet devices using Tailscale Serve. Do not use Tailscale Funnel for the trading runtime.

```bash
docker compose -f docker-compose.tailnet.yml up -d --build
tailscale serve --bg 3000
tailscale serve status
```
