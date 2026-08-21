import { createServer } from 'node:http';
import { runAgent } from './agent.js';

const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', agent: 'neoflgpt-parallel' }));
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
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ output: result.finalOutput }));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'agent failure' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, () => console.log(`NeoFLGPT Parallel agent listening on ${port}`));
