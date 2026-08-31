import { z } from 'zod';

const Json = z.record(z.string(), z.unknown());

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value.replace(/\/$/, '');
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

async function gatewayRequest(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = required('ADMIN_GATEWAY_URL');
  const token = required('ADMIN_GATEWAY_TOKEN');
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${text.slice(0, 500)}`);
  return Json.parse(JSON.parse(text));
}

export async function accountList(): Promise<Record<string, unknown>> {
  return gatewayRequest('/api/v1/accounts/list', {});
}

export async function accountDetails(accountId: string): Promise<Record<string, unknown>> {
  return gatewayRequest('/api/v1/accounts/details', { account_id: accountId });
}

export async function mt5AccountDetails(accountId: string): Promise<Record<string, unknown>> {
  return gatewayRequest('/api/v1/accounts/mt5/details', { account_id: accountId });
}

export async function dhanAccountDetails(accountId: string): Promise<Record<string, unknown>> {
  return gatewayRequest('/api/v1/accounts/dhan/details', { account_id: accountId });
}

export async function brainInput(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = required('BRAIN_URL');
  const token = process.env.BRAIN_TOKEN;
  const response = await fetch(`${base}/api/v1/brain/input`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Brain input failed (${response.status}): ${text.slice(0, 500)}`);
  return Json.parse(JSON.parse(text));
}

export async function brainDecision(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = required('BRAIN_URL');
  const token = process.env.BRAIN_TOKEN;
  const response = await fetch(`${base}/api/v1/brain/decision`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Brain decision failed (${response.status}): ${text.slice(0, 500)}`);
  return Json.parse(JSON.parse(text));
}

export async function tradingAgentsAnalysis(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = required('TRADINGAGENTS_URL');
  const token = process.env.TRADINGAGENTS_TOKEN;
  const response = await fetch(`${base}/analyze`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number(process.env.TRADINGAGENTS_TIMEOUT_MS ?? 120000)),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`TradingAgents analysis failed (${response.status}): ${text.slice(0, 500)}`);
  return Json.parse(JSON.parse(text));
}
