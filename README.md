# NeoFLGPT Parallel

Agentic orchestration layer around the NeoFL Brain engine, now integrated with the open-source TradingAgents multi-agent research framework.

## Architecture

```text
                         ADMIN / POLICY
                              |
                   AGENTIC ORCHESTRATOR
                              |
                 observe -> reason -> act
                              |
             +----------------+----------------+
             |                                 |
        ALPACA MCP                     NEOFL BRAIN
             |                                 |
    market data + trading              strategy / decisions
             |                                 |
             +---------------+-----------------+
                             |
                     TRADINGAGENTS
                     research branch
                             |
              market / news / social / fundamentals
                             |
                    analysis + cross-check
                             |
                        execution gate
                             |
                           ALPACA
```

### Roles

- **Alpaca MCP** is the primary and authoritative external market-data and trade-execution API when enabled. The official Alpaca MCP server exposes account, trading, market-data and related toolsets.
- **NeoFL Brain** remains the strategy/reasoning engine.
- **TradingAgents** is integrated as an independent multi-agent research and cross-checking branch. It can produce market, social, news and fundamentals analysis and a five-tier research signal, but it has no order-execution capability in this integration.
- **Execution is Alpaca-only.** No MT5 market-data or execution bridge is part of this runtime.
- **Feedback is mandatory:** after an execution result, actual Alpaca account/order/position/fill state must be reconciled before another action is taken.

## TradingAgents bridge

`services/tradingagents_bridge` pins the upstream TradingAgents repository to commit `2448d0a12576f9b2ddcd5980a0630833423d1e1b` and exposes a small internal HTTP API:

- `GET /health`
- `POST /analyze`

The bridge is analysis-only. It does not expose order placement, account mutation, or broker credentials to the TradingAgents graph.

The NeoFL agent adds a `tradingagents_analysis` tool only when `TRADINGAGENTS_URL` is configured. The orchestration layer can therefore compare TradingAgents research with NeoFL Brain reasoning before an action is authorized.

## Environment

Copy `.env.example` into the runtime environment and provide real secrets through the deployment secret store. Never commit API keys.

```text
OPENAI_API_KEY=...
BRAIN_URL=https://<actual-brain-host>
BRAIN_TOKEN=<optional>
ADMIN_GATEWAY_URL=https://<admin-host>
ADMIN_GATEWAY_TOKEN=<connection-scoped-token>
MCP_URL=https://<mcp-host>/mcp
MCP_NAME=NeoFL MCP Gateway
MCP_TOKEN=<optional>
MCP_TIMEOUT_MS=15000

ALPACA_MCP_ENABLED=true
ALPACA_API_KEY=<alpaca-api-key>
ALPACA_SECRET_KEY=<alpaca-secret-key>
ALPACA_TOOLSETS=account,trading,stock-data,options-data,crypto-data
ALPACA_MCP_COMMAND=uvx
ALPACA_MCP_TIMEOUT_MS=20000

TRADINGAGENTS_URL=http://tradingagents:8000
TRADINGAGENTS_TOKEN=<optional-bridge-token>
TRADINGAGENTS_TIMEOUT_MS=120000
TRADINGAGENTS_BRIDGE_TOKEN=<optional-bridge-token>
TRADINGAGENTS_LLM_PROVIDER=openai
TRADINGAGENTS_DEEP_THINK_LLM=gpt-5.6
TRADINGAGENTS_QUICK_THINK_LLM=gpt-5.6-luna

AGENT_MODE=observe
ALLOW_EXECUTION=false
REQUIRE_ADMIN_AUTH=true
MAX_TOOL_CALLS_PER_TURN=12
PORT=3000
```

## Run

```bash
npm install
npm run typecheck
npm start
```

Health: `GET /health`

Agent: `POST /agent/run` with `{ "input": "..." }`.

## Private Tailnet deployment

The intended deployment is a private Tailscale tailnet. Tailscale Serve can expose the local NeoFL service to devices on the tailnet over HTTPS while keeping the service off the public internet.

```bash
docker compose -f docker-compose.tailnet.yml up -d --build
tailscale serve --bg 3000
tailscale serve status
```

The service remains bound to localhost on the host; Tailscale Serve provides the tailnet-facing HTTPS endpoint. Do not use Tailscale Funnel for the trading runtime.
