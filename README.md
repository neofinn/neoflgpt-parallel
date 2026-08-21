# NeoFLGPT Parallel

Agentic orchestration layer around the NeoFL Brain engine.

The runtime uses the OpenAI Agents SDK for the agent loop, tools, guardrails, and MCP integration. The Brain remains the reasoning/trading engine; this layer adds observation, planning, tool use, and the Admin authorization boundary.

## Architecture

```text
                    ADMIN DOCK
                         |
              authorization / policy
                         |
        +----------------+----------------+
        |                                 |
     MCP DOCK                         BRAIN ENGINE
        |                                 |
        +---------- direct feed ----------+
                         |
                 AGENTIC ORCHESTRATOR
                         |
              observe -> reason -> act
                         |
                 execution gate
                         |
                  MT5 / execution
```

### Rules

- `MCP_URL` is optional. When configured, MCP is connected directly to the agent as the Brain data/tool feeder.
- `ADMIN_GATEWAY_URL` and `ADMIN_GATEWAY_TOKEN` authorize privileged capabilities.
- `BRAIN_URL` points to the actual Brain deployment and is supplied through environment configuration; no deployment URL is hard-coded.
- `AGENT_MODE` defaults to `observe`.
- Live execution requires both `AGENT_MODE=live` and `ALLOW_EXECUTION=true`, plus Admin authorization.
- The agent never places orders directly.
- Do not store provider keys in source control.

## Environment

```text
OPENAI_API_KEY=...
BRAIN_URL=https://<actual-brain-host>
BRAIN_TOKEN=<optional>
ADMIN_GATEWAY_URL=https://<admin-host>
ADMIN_GATEWAY_TOKEN=<connection-scoped-token>
MCP_URL=https://<mcp-host>/mcp
MCP_NAME=NeoFL MCP
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

The repository is intentionally provider-neutral. Real Admin, Brain, and MCP endpoints are injected through deployment configuration. No stale Vercel/AppDeploy URLs are embedded.
