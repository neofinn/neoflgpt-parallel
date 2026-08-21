import { Agent, MCPServerStreamableHttp, run, tool } from '@openai/agents';
import { z } from 'zod';
import { adminAuthorize, brainDecision, brainInput } from './gateway.js';
import { executionAllowed, loadPolicy } from './policy.js';

const policy = loadPolicy();

const observeBrain = tool({
  name: 'observe_brain',
  description: 'Send normalized observations to the existing Brain and return its response. Never execute trades.',
  parameters: z.object({
    observation: z.record(z.string(), z.unknown()),
  }),
  execute: async ({ observation }) => brainInput({ observation, mode: policy.mode }),
});

const requestBrainDecision = tool({
  name: 'request_brain_decision',
  description: 'Ask the existing Brain engine for a decision from normalized observations. This tool never submits an order.',
  parameters: z.object({
    context: z.record(z.string(), z.unknown()),
  }),
  execute: async ({ context }) => brainDecision({ context, mode: policy.mode }),
});

const executionGate = tool({
  name: 'request_execution_authorization',
  description: 'Ask Admin whether execution is authorized. This is a gate only and does not place an order.',
  parameters: z.object({
    capability: z.string(),
  }),
  execute: async ({ capability }) => ({
    authorized: executionAllowed(policy) && await adminAuthorize(capability),
    mode: policy.mode,
  }),
});

export async function buildAgent() {
  const mcpUrl = process.env.MCP_URL;
  let mcpServers: MCPServerStreamableHttp[] = [];

  if (mcpUrl) {
    const mcp = new MCPServerStreamableHttp({
      url: mcpUrl,
      name: process.env.MCP_NAME ?? 'NeoFL MCP',
    });
    await mcp.connect();
    mcpServers = [mcp];
  }

  return new Agent({
    name: 'NeoFLGPT Parallel Agent',
    instructions: [
      'You are the agentic orchestration layer around the NeoFL Brain engine.',
      'Observe before deciding. Use MCP for authorized data and tools when available.',
      'Use the Brain engine for normalized observations and decisions.',
      'Never invent market data, account state, fills, or tool results.',
      'Never place an order directly. Execution requires the Admin authorization gate and the downstream execution system.',
      `Current operating mode: ${policy.mode}.`,
    ].join(' '),
    tools: [observeBrain, requestBrainDecision, executionGate],
    mcpServers,
    mcpConfig: { includeServerInToolNames: true },
  });
}

export async function runAgent(input: string) {
  const agent = await buildAgent();
  return run(agent, input, { maxTurns: policy.maxToolCallsPerTurn });
}
