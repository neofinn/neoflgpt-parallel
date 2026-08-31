# NeoFLGPT Parallel

Agentic orchestration layer around the NeoFL Brain engine, integrated with TradingAgents and a broker/account gateway.

## Architecture

```text
                         DASHBOARD
                            |
                  ACCOUNT CONNECTIONS
                            |
          +-----------------+------------------+
          |                                    |
       ALPACA                               MT5
          |                                    |
   data + trading                         DATA ONLY
          |                                    |
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
                    TRADING-enabled
                         account
                            |
                     Broker execution
                            |
                      actual fills
                            |
                       feedback
                            |
                       NEOFL BRAIN
```

### Account model

The dashboard is the account-control surface. Each connected account has a provider, an account identifier, connection status, and an explicit mode:

- `DATA_ONLY`: market/account information can be read and displayed, but no order may be submitted.
- `TRADING`: the account may be selected by TradingAgents for execution, subject to authorization/policy checks.

**MT5 accounts are data-only.** Their account details can be connected through the account gateway and displayed in the dashboard, but MT5 is not an execution path for this runtime.

Alpaca can be connected as either data-only or trading, according to the dashboard account setting. When an Alpaca account is trading-enabled, it is the execution destination.

### Responsibility split

- **NeoFL Brain:** analysis only. It consumes normalized market/account observations, performs its own reasoning, and emits an order intent. It does not directly submit broker orders.
- **TradingAgents:** execution engine. It receives the Brain order intent, validates the selected account and execution permissions, submits the order through the broker adapter, and returns the actual broker response.
- **Dashboard:** manages connected accounts and their `DATA_ONLY`/`TRADING` mode and displays account/position/order information. Broker secrets stay server-side.
- **MT5 adapter:** read-only account/data adapter for dashboard visibility. It has no order-placement capability.
- **Alpaca:** market-data and execution interface for Alpaca accounts.
- **Feedback:** actual broker/order/fill/account state is reconciled and returned to NeoFL Brain before subsequent decisions.

## Dashboard account API

The runtime exposes read-only dashboard endpoints through the account gateway:

- `GET /api/dashboard/accounts` — list connected accounts and their mode/provider metadata.
- `GET /api/dashboard/accounts/{accountId}` — account details.
- `GET /api/dashboard/accounts/{accountId}/mt5` — MT5 account details for an MT5-connected account.

The MT5 endpoint is intentionally read-only. It is designed to return dashboard-safe account information such as connection state, login/account identifier, server, balance, equity, margin/free margin, positions and other broker-provided read data. Credentials are never returned to the dashboard.

## TradingAgents

`services/tradingagents_bridge` integrates the upstream TradingAgents framework as the execution-engine research/runtime component. The execution adapter is responsible for broker submission; TradingAgents does not receive raw broker credentials.

## Execution rules

```text
DATA_ONLY account  -> execution request -> HARD BLOCK
TRADING account    -> policy/auth check -> TradingAgents -> broker
MT5 account        -> execution request -> HARD BLOCK
```

There is no MT5 execution bridge in the runtime.

## Private Tailnet deployment

The intended deployment is a private Tailscale tailnet. The service is bound to localhost and exposed to authorized tailnet devices using Tailscale Serve. Do not use Tailscale Funnel for the trading runtime.

```bash
docker compose -f docker-compose.tailnet.yml up -d --build
tailscale serve --bg 3000
tailscale serve status
```
