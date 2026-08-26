# NeoFLGPT Parallel

Agentic orchestration layer around the NeoFL Brain engine.

The runtime uses the OpenAI Agents SDK for the agent loop, tools, guardrails, and MCP integration. The Brain remains the reasoning/trading engine; this layer adds observation, planning, tool use, and the Admin authorization boundary.

## Architecture

```text
                         ADMIN DOCK
                              |
                   authorization / policy
                              |
                    AGENTIC ORCHESTRATOR
                              |
                 observe -> reason -> act
                              |
                 +------------+------------+
                 |                         |
          ALPACA MCP                 NEOFL BRAIN
                 |                         |
       market data + trading       strategy / decisions
                 |                         |
                 +------------+------------+
                              |
                       execution gate
                              |
                         MT5 EA / API
                              |
                      actual broker account
                              |
                         feedback loop
                              |
                         Brain / Agent
```

### Roles

- **Alpaca MCP** is the primary external market-data and trading API when enabled. The official Alpaca MCP server exposes account, trading, market-data and related toolsets. urlAlpaca MCP Serverhttps://github.com/alpacahq/alpaca-mcp-server
- **NeoFL Brain** remains the reasoning/trading decision engine.
- **MT5 EA/API** remains the broker-account bridge. It receives authorized instructions and returns actual account, order, position, fill and execution state.
- **Feedback is mandatory:** execution results must be reconciled with actual state before another action is taken.

### Rules

- `MCP_URL` is optional for an external Streamable HTTP MCP gateway.
- `ALPACA_MCP_ENABLED=true` enables the official Alpaca MCP server locally through `uvx alpaca-mcp-server`.
- `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` are runtime secrets and must never be committed to GitHub.
- `ALPACA_TOOLSETS` can restrict the Alpaca MCP toolsets; the official server enables all toolsets by default. citeturn0search0turn0search3
- `ADMIN_GATEWAY_URL` and `ADMIN_GATEWAY_TOKEN` authorize privileged capabilities.
- `BRAIN_URL` points to the actual Brain deployment and is supplied through environment configuration; no deployment URL is hard-coded.
- `AGENT_MODE` defaults to `observe`.
- Live execution requires both `AGENT_MODE=live` and `ALLOW_EXECUTION=true`, plus Admin authorization.
- Never invent market data, account state, fills, order tickets, or tool results.
- Do not store provider keys in source control.

## Alpaca MCP

The runtime uses the OpenAI Agents SDK `MCPServerStdio` transport to launch the Alpaca MCP server locally. The SDK supports stdio MCP servers using `command`, `args`, and `env`, which matches the official Alpaca setup pattern. citeturn2search0

The repository contains a safe template at `config/alpaca.mcp.example.json`. It contains placeholders only; real credentials belong in deployment/runtime environment variables.

## Environment

Copy `.env.example` into the runtime environment and provide real values through the deployment secret store.

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

The repository keeps provider credentials and deployment URLs outside source control. No stale Vercel/AppDeploy URLs are embedded.
