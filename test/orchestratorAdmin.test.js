const assert = require('node:assert/strict');
const test = require('node:test');

const { createAdminServer } = require('../admin/server');
const { OrchestratorClient } = require('../admin/orchestratorClient');

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('admin exposes gen status and manages only Matrix orchestrator personas', async (t) => {
  const calls = [];
  const orchestratorClient = {
    status: async (model) => ({
      endpoint: 'https://gen.example',
      model,
      health: { status: 'ok', service: 'comment-orchestrator' },
      models: [{ model: 'auto/best-chat', provider: 'omniroute', available: true }],
    }),
    listMatrixPersonas: async () => [{ source: 'matrix', chat_id: '@anna:chat.example', name: 'Anna' }],
    upsertMatrixPersona: async (payload) => {
      calls.push(['upsert', payload]);
      return { source: 'matrix', chat_id: payload.chat_id, ...payload.persona };
    },
    deleteMatrixPersona: async (chatId) => calls.push(['delete', chatId]),
  };
  const server = createAdminServer({
    personaStore: { list: () => [] },
    llmStore: { public: () => ({ model: 'auto/best-chat', temperature: 0.3, max_tokens: 1200 }) },
    orchestratorClient,
  });
  const base = await listen(server);
  t.after(() => server.close());

  const status = await fetch(`${base}/api/gen`);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), {
    endpoint: 'https://gen.example',
    model: 'auto/best-chat',
    health: { status: 'ok', service: 'comment-orchestrator' },
    models: [{ model: 'auto/best-chat', provider: 'omniroute', available: true }],
  });

  const listed = await fetch(`${base}/api/gen/personas`);
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), [{ source: 'matrix', chat_id: '@anna:chat.example', name: 'Anna' }]);

  const upserted = await fetch(`${base}/api/gen/personas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: '@new:chat.example', persona: { name: 'New', style: 'concise', notes: 'Matrix identity' } }),
  });
  assert.equal(upserted.status, 201);
  assert.equal((await upserted.json()).source, 'matrix');
  assert.deepEqual(calls[0], ['upsert', { chat_id: '@new:chat.example', persona: { name: 'New', style: 'concise', notes: 'Matrix identity' } }]);

  const deleted = await fetch(`${base}/api/gen/personas/${encodeURIComponent('@new:chat.example')}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  assert.deepEqual(calls[1], ['delete', '@new:chat.example']);
});

test('admin page retains existing controls and renders gen Matrix identity controls', async (t) => {
  const server = createAdminServer({ personaStore: { list: () => [] } });
  const base = await listen(server);
  t.after(() => server.close());

  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /id="llm"/);
  assert.match(html, /id="personas"/);
  assert.match(html, /Unified gen/);
  assert.match(html, /Matrix persona identities/);
  assert.match(html, /api\('\/api\/gen'/);
  assert.match(html, /api\('\/api\/gen\/personas'/);
});

test('orchestrator adapter uses the live API contract and forces Matrix source', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options.method, options.body]);
    if (url.endsWith('/healthz')) return new Response(JSON.stringify({ status: 'ok' }));
    if (url.endsWith('/api/v1/models')) return new Response(JSON.stringify([{ model: 'auto/best-chat' }]));
    if (url.includes('/api/v1/personas?')) return new Response(JSON.stringify([]));
    if (options.method === 'POST') return new Response(options.body, { status: 201 });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  };
  const client = new OrchestratorClient({ endpoint: 'https://gen.example/', fetchImpl });

  assert.deepEqual(await client.status('auto/best-chat'), {
    endpoint: 'https://gen.example',
    model: 'auto/best-chat',
    health: { status: 'ok' },
    models: [{ model: 'auto/best-chat' }],
  });
  assert.deepEqual(await client.listMatrixPersonas(), []);
  await client.upsertMatrixPersona({ chat_id: '@anna:chat.example', persona: { name: 'Anna' }, source: 'telegram' });
  await client.deleteMatrixPersona('@anna:chat.example');

  assert.equal(calls[2][0], 'https://gen.example/api/v1/personas?source=matrix&limit=500');
  assert.deepEqual(JSON.parse(calls[3][2]), { source: 'matrix', chat_id: '@anna:chat.example', persona: { name: 'Anna' } });
  assert.equal(calls[4][0], 'https://gen.example/api/v1/personas/matrix/%40anna%3Achat.example');
});
