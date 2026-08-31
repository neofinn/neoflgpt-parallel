import { createServer } from 'node:http';
import { accountDetails, accountList, dhanAccountDetails, mt5AccountDetails } from './gateway.js';
import { runAgent } from './agent.js';

const port = Number(process.env.PORT ?? 3000);

function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function pathParts(url: string): string[] {
  return url.split('?')[0].split('/').filter(Boolean);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { status: 'ok', agent: 'neoflgpt-parallel' });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/dashboard/accounts') {
      json(res, 200, await accountList());
      return;
    }

    const parts = pathParts(req.url ?? '');
    if (req.method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'dashboard' && parts[2] === 'accounts') {
      const accountId = decodeURIComponent(parts[3]);
      json(res, 200, await accountDetails(accountId));
      return;
    }

    if (req.method === 'GET' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'dashboard' && parts[2] === 'accounts' && parts[4] === 'mt5') {
      const accountId = decodeURIComponent(parts[3]);
      json(res, 200, await mt5AccountDetails(accountId));
      return;
    }

    if (req.method === 'GET' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'dashboard' && parts[2] === 'accounts' && parts[4] === 'dhan') {
      const accountId = decodeURIComponent(parts[3]);
      json(res, 200, await dhanAccountDetails(accountId));
      return;
    }

    if (req.method === 'POST' && req.url === '/agent/run') {
      let raw = '';
      req.on('data', chunk => { raw += chunk; });
      req.on('end', async () => {
        try {
          const body = JSON.parse(raw || '{}') as { input?: string };
          if (!body.input) throw new Error('input is required');
          const result = await runAgent(body.input);
          json(res, 200, { output: result.finalOutput });
        } catch (error) {
          json(res, 500, { error: error instanceof Error ? error.message : 'agent failure' });
        }
      });
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (error) {
    json(res, 502, { error: error instanceof Error ? error.message : 'gateway failure' });
  }
});

server.listen(port, () => console.log(`NeoFLGPT Parallel agent listening on ${port}`));
