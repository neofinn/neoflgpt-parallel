import { z } from 'zod';

export const AgentMode = z.enum(['observe', 'paper', 'live']);
export type AgentMode = z.infer<typeof AgentMode>;

export const AgentPolicy = z.object({
  mode: AgentMode.default('observe'),
  allowExecution: z.boolean().default(false),
  maxToolCallsPerTurn: z.number().int().positive().max(50).default(12),
  requireAdminAuthorization: z.boolean().default(true),
});

export type Policy = z.infer<typeof AgentPolicy>;

export function loadPolicy(): Policy {
  return AgentPolicy.parse({
    mode: process.env.AGENT_MODE ?? 'observe',
    allowExecution: process.env.ALLOW_EXECUTION === 'true',
    maxToolCallsPerTurn: process.env.MAX_TOOL_CALLS_PER_TURN
      ? Number(process.env.MAX_TOOL_CALLS_PER_TURN)
      : 12,
    requireAdminAuthorization: process.env.REQUIRE_ADMIN_AUTH !== 'false',
  });
}

export function executionAllowed(policy: Policy): boolean {
  return policy.mode === 'live' && policy.allowExecution;
}
