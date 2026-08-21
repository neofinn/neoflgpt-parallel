import { Agent, MCPServerStreamableHttp, run, tool } from '@openai/agents';
import { z } from 'zod';
import { adminAuthorize, brainDecision, brainInput } from './gateway.js';
import { executionAllowed, loadPolicy } from './policy.js';

const policy = loadPolicy();

const observeBrain = tool({
  name: 'observe_brain',
  description: 'Send normalized live observations to the NeoFL Brain and return its response.',
  parameters: z.object({
    observation: z.record(z.string(), z.unknown()),
  }),
  execute: async ({ observation }) => brainInput({ observation, mode: policy.mode }),
});

const requestBrainDecision = tool({
  name: 'request_brain_decision',
  description: 'Ask the NeoFL Brain engine for a decision from normalized live observations.',
  parameters: z.object({
    context: z.record(z.string(), z.unknown()),
  }),
  execute: async ({ context }) => brainDecision({ context, mode: policy.mode }),
});

const executionStatus = tool({
  name: 'execution_status',
  description: 'Return Admin execution authorization state for diagnostics. MT5 MCP tools remain the execution interface.',
  parameters: z.object({ capability: z.string().default('trade.execute') }),
  execute: async ({ capability }) => ({
    authorized: executionAllowed(policy) && await adminAuthorize(capability),
    mode: policy.mode,
  }),
});

export async function buildAgent() {
  const mcpUrl = process.env.MCP_URL;
  const mcpServers: MCPServerStreamableHttp[] = [];

  if (mcpUrl) {
    const headers: Record<string, string> = {};
    if (process.env.MCP_TOKEN) headers.Authorization = `Bearer ${process.env.MCP_TOKEN}`;

    const mcp = new MCPServerStreamableHttp({
      url: mcpUrl,
      name: process.env.MCP_NAME ?? 'NeoFL MT5 Live Terminal',
      requestInit: { headers },
      cacheToolsList: false,
      timeout: Number(process.env.MCP_TIMEOUT_MS ?? 15000),
      maxRetryAttempts: 3,
    });
    await mcp.connect();
    mcpServers.push(mcp);
  }

  return new Agent({
    name: 'NeoFLGPT Parallel Agent',
    instructions: [
      'You are the agentic orchestration layer around the NeoFL Brain engine.',
      'Operate from live observations. Observe the account and market before deciding.',
      'Use the MT5 MCP server for live account, symbol, market, position, order and trading capabilities when connected.',
      'Use the NeoFL Brain for normalized observations and strategic decisions.',
      'The MT5 MCP trading tools are the execution interface. When the Brain decides to trade, use the appropriate MT5 MCP tool and then inspect the returned execution result.',
      'Never invent market data, account state, fills, order tickets, or tool results.',
      'After an execution result, feed the result back into the Brain and reassess the live state.',
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
