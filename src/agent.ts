import {
  Agent,
  MCPServerStdio,
  MCPServerStreamableHttp,
  run,
  tool,
} from '@openai/agents';
import { z } from 'zod';
import { accountState, adminAuthorize, brainDecision, brainInput, tradingAgentsExecute } from './gateway.js';
import { executionAllowed, loadPolicy } from './policy.js';

const policy = loadPolicy();
type LocalMcpServer = MCPServerStdio | MCPServerStreamableHttp;

const observeBrain = tool({
  name: 'observe_brain',
  description: 'Send normalized live observations to the NeoFL Brain. The Brain analyzes independently and does not execute trades.',
  parameters: z.object({ observation: z.record(z.string(), z.unknown()) }),
  execute: async ({ observation }) => brainInput({ observation, mode: policy.mode }),
});

const requestBrainDecision = tool({
  name: 'request_brain_decision',
  description: 'Ask the NeoFL Brain for an independent analysis/trading decision. The Brain returns an order intent; it does not execute it.',
  parameters: z.object({ context: z.record(z.string(), z.unknown()) }),
  execute: async ({ context }) => brainDecision({ context, mode: policy.mode }),
});

const getAccountState = tool({
  name: 'get_account_state',
  description: 'Read the current state of a connected account. Dashboard account mode controls whether the account is data-only or trading-enabled.',
  parameters: z.object({ account_id: z.string().min(1) }),
  execute: async ({ account_id }) => accountState(account_id),
});

const sendOrderToTradingAgents = tool({
  name: 'send_order_to_tradingagents',
  description: 'Send a NeoFL Brain order intent to the TradingAgents execution engine for a dashboard-selected trading-enabled account. Never use this for data-only accounts.',
  parameters: z.object({
    account_id: z.string().min(1),
    symbol: z.string().min(1),
    side: z.enum(['buy', 'sell']),
    quantity: z.number().positive(),
    order_type: z.enum(['market', 'limit', 'stop', 'stop_limit']).default('market'),
    limit_price: z.number().positive().optional(),
    stop_price: z.number().positive().optional(),
    time_in_force: z.enum(['day', 'gtc', 'opg', 'cls', 'ioc', 'fok']).default('day'),
    client_order_id: z.string().optional(),
    brain_reason: z.string().optional(),
  }),
  execute: async (order) => {
    if (!executionAllowed(policy)) {
      return { accepted: false, reason: 'Execution disabled by runtime policy', mode: policy.mode };
    }
    const authorized = await adminAuthorize('trade.execute');
    if (!authorized) return { accepted: false, reason: 'Admin authorization denied' };

    return tradingAgentsExecute({
      ...order,
      source: 'NeoFL Brain',
      execution_engine: 'TradingAgents',
    });
  },
});

const executionStatus = tool({
  name: 'execution_status',
  description: 'Return Admin execution authorization state for TradingAgents execution.',
  parameters: z.object({ capability: z.string().default('trade.execute') }),
  execute: async ({ capability }) => ({
    authorized: executionAllowed(policy) && await adminAuthorize(capability),
    mode: policy.mode,
    execution_engine: 'TradingAgents',
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
      'You are the agentic orchestration layer around the NeoFL Brain.',
      'Connected accounts are managed by the dashboard. Every account has an explicit mode: DATA_ONLY or TRADING.',
      'DATA_ONLY accounts may provide market/account data for analysis but must never receive an order.',
      'TRADING accounts may receive orders only through the TradingAgents execution engine after authorization.',
      'The NeoFL Brain is analysis-only. It independently observes data, reasons, creates an order intent, and sends that intent to TradingAgents for execution.',
      'TradingAgents is the execution engine in this architecture. It is responsible for validating the order intent, submitting it to the selected connected account API, and returning the actual broker response.',
      'Alpaca is the connected-account API/broker interface when an account is an Alpaca account. Do not use MT5.',
      'Never invent market data, account state, fills, order tickets, or execution results.',
      'Before sending an order, verify the target account is explicitly trading-enabled and obtain current account state.',
      'After execution, reconcile the returned order/fill/account state and feed the actual result back to the NeoFL Brain for the next analysis cycle.',
      `Current operating mode: ${policy.mode}.`,
    ].join(' '),
    tools: [observeBrain, requestBrainDecision, getAccountState, sendOrderToTradingAgents, executionStatus],
    mcpServers,
    mcpConfig: { includeServerInToolNames: true },
  });
}

export async function runAgent(input: string) {
  const agent = await buildAgent();
  return run(agent, input, { maxTurns: policy.maxToolCallsPerTurn });
}
