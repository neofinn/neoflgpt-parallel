import { z } from 'zod';

const Json = z.record(z.string(), z.unknown());

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value.replace(/\/$/, '');
}

async function postJson(base: string, path: string, payload: Record<string, unknown>, token?: string, timeoutMs = 30000) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${text.slice(0, 500)}`);
  return Json.parse(JSON.parse(text));
}

export async function adminAuthorize(capability: string): Promise<boolean> {
  const base = required('ADMIN_GATEWAY_URL');
  const token = required('ADMIN_GATEWAY_TOKEN');
  const response = await fetch(`${base}/api/v1/agent/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ capability }),
  });
  if (!response.ok) return false;
  const body = await response.json();
  return body?.authorized === true;
}

export async function brainInput(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return postJson(required('BRAIN_URL'), '/api/v1/brain/input', payload, process.env.BRAIN_TOKEN);
}

export async function brainDecision(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return postJson(required('BRAIN_URL'), '/api/v1/brain/decision', payload, process.env.BRAIN_TOKEN);
}

export async function tradingAgentsExecute(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return postJson(
    required('TRADINGAGENTS_URL'),
    '/execute',
    payload,
    process.env.TRADINGAGENTS_TOKEN,
    Number(process.env.TRADINGAGENTS_TIMEOUT_MS ?? 30000),
  );
}

export async function accountsList(): Promise<Record<string, unknown>> {
  return postJson(required('ACCOUNT_GATEWAY_URL'), '/accounts/list', {}, process.env.ACCOUNT_GATEWAY_TOKEN);
}

export async function accountState(accountId: string): Promise<Record<string, unknown>> {
  return postJson(required('ACCOUNT_GATEWAY_URL'), '/accounts/state', { account_id: accountId }, process.env.ACCOUNT_GATEWAY_TOKEN);
}
