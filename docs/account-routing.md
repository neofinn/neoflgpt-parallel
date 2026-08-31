# Account routing contract

The dashboard is the control plane for connected broker/API accounts.

## Account modes

Every connected account has exactly one operational mode:

- `DATA_ONLY`: account credentials/API are used for permitted data reads. No order can be submitted to the account.
- `TRADING`: account can be selected as an execution destination. Orders still require runtime policy and Admin authorization.

The UI should make the mode explicit with a per-account toggle and show the current mode in every account card.

## Separation of responsibilities

```text
Dashboard
  ├─ Connect API account
  ├─ Store/manage account connection securely
  ├─ Set DATA_ONLY or TRADING
  └─ Select enabled trading account(s)
             │
             ├──────────────► data access
             │
             ▼
NeoFL Brain
  ├─ reads observations
  ├─ performs its own analysis
  ├─ produces order intent
  └─ sends order intent
             │
             ▼
TradingAgents Execution Engine
  ├─ validates account mode
  ├─ validates order parameters
  ├─ resolves account execution context
  ├─ submits through broker API
  └─ returns actual order/fill/error state
             │
             ▼
Selected TRADING account
```

TradingAgents is the execution layer in the NeoFL runtime. The upstream TradingAgents project is an agentic research framework; this repository wraps it with an execution adapter rather than pretending the upstream project itself is a broker API.

## Account gateway contract

The execution engine calls:

`POST {ACCOUNT_GATEWAY_URL}/accounts/execution-context`

Request:

```json
{"account_id":"acct_123"}
```

Response must contain:

```json
{
  "account_id":"acct_123",
  "mode":"TRADING",
  "provider":"alpaca",
  "api_key":"...",
  "secret_key":"...",
  "trading_base_url":"https://api.alpaca.markets"
}
```

For `DATA_ONLY`, the gateway must return `mode: DATA_ONLY`; the execution engine rejects the order before contacting the broker.

The dashboard must never expose broker secrets to the browser after initial connection. The account gateway should return execution credentials only over the private service network to the execution engine, ideally as short-lived/rotatable credentials or a server-side credential reference.

## Data-only accounts

Data-only accounts can still be useful to NeoFL Brain as observation sources. They must be excluded from all execution destinations, even if an order intent names their `account_id`.

## Trading accounts

Only accounts explicitly marked `TRADING` are eligible for execution. Before each order, the execution path should re-check the account mode and obtain current account state. After the broker response, the actual order/fill/account state is returned to NeoFL Brain for reconciliation.
