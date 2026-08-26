import {
  Agent,
  MCPServerStdio,
  MCPServerStreamableHttp,
  run,
  tool,
} from '@openai/agents';
import { z } from 'zod';
import { adminAuthorize, brainDecision, brainInput } from './gateway.js';
import { executionAllowed, loadPolicy } from './policy.js';

const policy = loadPolicy();
type LocalMcpServer = MCPServerStdio | MCPServerStreamableHttp;

const observeBrain = tool({
  name: 'observe_brain',
  description: 'Send normalized live observations to the NeoFL Brain and return its response.',
  parameters: z.object({ observation: z.record(z.string(), z.unknown()) }),
  execute: async ({ observation }) => brainInput({ observation, mode: policy.mode }),
});

const requestBrainDecision = tool({
  name: 'request_brain_decision',
  description: 'Ask the NeoFL Brain engine for a decision from normalized live observations.',
  parameters: z.object({ context: z.record(z.string(), z.unknown()) }),
  execute: async ({ context }) => brainDecision({ context, mode: policy.mode }),
});

const executionStatus = tool({
  name: 'execution_status',
  description: 'Return Admin execution authorization state. MT5 EA/API remains the broker-account execution interface.',
  parameters: z.object({ capability: z.string().default('trade.execute') }),
  execute: async ({ capability }) => ({
    authorized: executionAllowed(policy) && await adminAuthorize(capability),
    mode: policy.mode,
  }),
});

export async function buildAgent() {
  const mcpServers: LocalMcpServer[] = [];

  const mcpUrl = process.env.MCP_URL;
  if (mcpUrl) {
    const headers: Record<string, string> = {};
    if (process.env.MCP_TOKEN) headers.Authorization = `Bearer ${process.env.MCP_TOKEN}`;
    const mcp = new MCPServerStreamableHttp({
      url: mcpUrl,
      name: process.env.MCP_NAME ?? 'NeoFL MCP Gateway',
      requestInit: { headers },
      cacheToolsList: false,
      timeout: Number(process.env.MCP_TIMEOUT_MS ?? 15000),
      maxRetryAttempts: 3,
    });
    await mcp.connect();
    mcpServers.push(mcp);
  }

  // Official Alpaca MCP server over stdio. Secrets come only from runtime env.
  if (process.env.ALPACA_MCP_ENABLED === 'true') {
    const apiKey = process.env.ALPACA_API_KEY ?? '';
    const secretKey = process.env.ALPACA_SECRET_KEY ?? '';
    if (!apiKey || !secretKey) {
      throw new Error('ALPACA_MCP_ENABLED=true requires ALPACA_API_KEY and ALPACA_SECRET_KEY');
    }

    const alpacaEnv: Record<string, string> = {
      ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)) as Record<string, string>,
      ALPACA_API_KEY: apiKey,
      ALPACA_SECRET_KEY: secretKey,
    };
    if (process.env.ALPACA_TOOLSETS) alpacaEnv.ALPACA_TOOLSETS = process.env.ALPACA_TOOLSETS;

    const alpaca = new MCPServerStdio({
      name: 'Alpaca Trading & Market Data',
      command: process.env.ALPACA_MCP_COMMAND ?? 'uvx',
      args: ['alpaca-mcp-server'],
      env: alpacaEnv,
      cacheToolsList: false,
      timeout: Number(process.env.ALPACA_MCP_TIMEOUT_MS ?? 20000),
    });
    await alpaca.connect();
    mcpServers.push(alpaca);
  }

  return new Agent({
    name: 'NeoFLGPT Parallel Agent',
    instructions: [
      'You are the agentic orchestration layer around the NeoFL Brain engine.',
      'Operate from live observations. Observe market and account state before deciding.',
      'Use Alpaca MCP as the primary external market-data and trading API when connected.',
      'Use the NeoFL Brain for normalized observations and strategic decisions.',
      'MT5 is the broker-account bridge: the MT5 EA/API receives authorized trade instructions and returns actual account, order, position, fill and execution state.',
      'Never invent market data, account state, fills, order tickets, or tool results.',
      'After every execution result, feed the actual result back into the Brain and reassess the live state.',
      'Alpaca and MT5 state must never be assumed identical; reconcile actual returned state before acting again.',
      `Current operating mode: ${policy.mode}.`,
    ].join(' '),
    tools: [observeBrain, requestBrainDecision, executionStatus],
    mcpServers,
    mcpConfig: { includeServerInToolNames: true },
  });
}

export async function runAgent(input: string) {
  const agent = await buildAgent();
  return run(agent, input, { maxTurns: policy.maxToolCallsPerTurn });
}
