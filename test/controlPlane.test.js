const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { isOwner } = require('../lib/access');
const { SecretVault } = require('../lib/secretVault');
const { PersonaStore } = require('../lib/personaStore');
const { LlmConfigStore } = require('../lib/llmConfigStore');
const { createAdminServer } = require('../admin/server');
const { handleCommand } = require('../handlers/commands');
const { eventMessage, timelineMessages } = require('../lib/matrixClient');
const { ClubActivation } = require('../lib/clubActivation');
const { SyncState } = require('../lib/syncState');

test('only explicitly configured Matrix users are owners', () => {
  const allowed = '@bezrabotnyi:chat.bezrabotnyi.com,@operator:chat.bezrabotnyi.com';

  assert.equal(isOwner('@bezrabotnyi:chat.bezrabotnyi.com', allowed), true);
  assert.equal(isOwner('@visitor:chat.bezrabotnyi.com', allowed), false);
  assert.equal(isOwner('', allowed), false);
});

test('secret vault encrypts bot credentials at rest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-botfather-test-'));
  const file = path.join(root, 'secrets.enc');
  const vault = new SecretVault(file, Buffer.alloc(32, 7).toString('base64'));

  vault.put('@notify:chat.bezrabotnyi.com', { token: 'matrix-secret-token', password: 'matrix-password' });

  assert.deepEqual(vault.get('@notify:chat.bezrabotnyi.com'), { token: 'matrix-secret-token', password: 'matrix-password' });
  const encrypted = fs.readFileSync(file, 'utf8');
  assert.equal(encrypted.includes('matrix-secret-token'), false);
  assert.equal(encrypted.includes('matrix-password'), false);
});

test('a failed vault write never registers a BotFather account without credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-botstore-test-'));
  const previous = {
    registry: process.env.BOTFATHER_REGISTRY_FILE,
    vault: process.env.BOTFATHER_VAULT_FILE,
    key: process.env.CONTROL_PLANE_MASTER_KEY,
  };
  process.env.BOTFATHER_REGISTRY_FILE = path.join(root, 'bots.json');
  process.env.BOTFATHER_VAULT_FILE = path.join(root, 'secrets.enc');
  delete process.env.CONTROL_PLANE_MASTER_KEY;
  const modulePath = require.resolve('../handlers/botStore');
  delete require.cache[modulePath];
  const store = require('../handlers/botStore');
  try {
    assert.throws(() => store.saveBot('@new:chat.bezrabotnyi.com', { username: 'new', token: 'unpersisted' }), /CONTROL_PLANE_MASTER_KEY/);
    assert.equal(store.getBot('@new:chat.bezrabotnyi.com'), null);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const env = key === 'registry' ? 'BOTFATHER_REGISTRY_FILE' : key === 'vault' ? 'BOTFATHER_VAULT_FILE' : 'CONTROL_PLANE_MASTER_KEY';
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    delete require.cache[modulePath];
  }
});

test('persona updates are validated and retain a rollback revision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-persona-test-'));
  const personas = path.join(root, 'personas');
  fs.mkdirSync(personas);
  const file = path.join(personas, 'anna_k.toml');
  fs.writeFileSync(file, 'username = "anna_k"\ndisplayname = "Anna"\n[character]\nprompt = "Old prompt"\n[style]\nsentences_per_part = 2\ntyping_speed_cps = 8\n');
  const store = new PersonaStore(personas, path.join(root, 'history'));

  const changed = store.update('anna_k', { displayname: 'Anna V', prompt: 'New prompt', style: { max_parts: 3 } });

  assert.equal(changed.displayname, 'Anna V');
  assert.equal(changed.character.prompt, 'New prompt');
  assert.equal(changed.style.max_parts, 3);
  assert.equal(fs.readdirSync(path.join(root, 'history', 'anna_k')).length, 1);
  assert.throws(() => store.update('../escape', { prompt: 'no' }), /invalid persona name/);
});

test('admin API relies on the trusted reverse proxy and writes a validated persona revision', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-admin-test-'));
  const personas = path.join(root, 'personas');
  fs.mkdirSync(personas);
  fs.writeFileSync(path.join(personas, 'anna_k.toml'), 'username = "anna_k"\ndisplayname = "Anna"\n[character]\nprompt = "Old"\n[style]\nsentences_per_part = 2\ntyping_speed_cps = 8\n');
  const activation = { activate: ({ username, displayname, prompt }) => ({ username, displayname, character: { prompt } }) };
  const server = createAdminServer({ personaStore: new PersonaStore(personas, path.join(root, 'history')), clubActivation: activation });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const listed = await fetch(`${base}/api/personas`);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json())[0].name, 'anna_k');
  const update = await fetch(`${base}/api/personas/anna_k`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'Updated' }) });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).character.prompt, 'Updated');
  const created = await fetch(`${base}/api/personas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'new_persona', displayname: 'New Persona', prompt: 'New prompt' }) });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).username, 'new_persona');
});

test('admin API lists BotFather-managed accounts without credentials', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-admin-bots-test-'));
  const personas = path.join(root, 'personas');
  fs.mkdirSync(personas);
  const server = createAdminServer({
    personaStore: new PersonaStore(personas, path.join(root, 'history')),
    botRegistry: () => [{ username: 'new_persona', userId: '@new_persona:chat.bezrabotnyi.com', displayName: 'New Persona', token: 'must-not-leak' }],
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/bots`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ username: 'new_persona', userId: '@new_persona:chat.bezrabotnyi.com', displayName: 'New Persona' }]);
});

test('admin page escapes stored persona fields and rejects cross-origin writes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-admin-security-test-'));
  const personas = path.join(root, 'personas');
  fs.mkdirSync(personas);
  fs.writeFileSync(path.join(personas, 'anna_k.toml'), 'username = "anna_k"\ndisplayname = "<img src=x onerror=alert(1)>"\n[character]\nprompt = "<script>alert(1)</script>"\n[style]\nsentences_per_part = 2\ntyping_speed_cps = 8\n');
  const server = createAdminServer({ personaStore: new PersonaStore(personas, path.join(root, 'history')) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const html = await (await fetch(`${base}/`)).text();
  assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
  assert.equal(html.includes("esc(p.displayname)"), true);
  const crossOrigin = await fetch(`${base}/api/personas/anna_k`, { method: 'PUT', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: JSON.stringify({ displayname: 'pwned' }) });
  assert.equal(crossOrigin.status, 403);
});

test('LLM config updates allow only non-secret runtime controls and keep a revision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-llm-test-'));
  const file = path.join(root, 'bot.toml');
  fs.writeFileSync(file, '[llm]\nendpoint = "https://llm.example/v1"\napi_key_env = "LLM_API_KEY"\nmodel = "old-model"\ntemperature = 0.7\nmax_tokens = 800\n');
  const store = new LlmConfigStore(file, path.join(root, 'history'));

  const llm = store.update({ model: 'new-model', temperature: 0.4, max_tokens: 1200 });

  assert.deepEqual(llm, { model: 'new-model', temperature: 0.4, max_tokens: 1200 });
  assert.equal(store.read().api_key_env, 'LLM_API_KEY');
  assert.throws(() => store.update({ api_key_env: 'OTHER_KEY' }), /unsupported llm field/);
  assert.equal(fs.readdirSync(path.join(root, 'history')).length, 1);
});

test('Matrix BotFather commands reject non-owner room senders', async () => {
  const previous = process.env.MATRIX_ADMIN_ALLOWED_USERS;
  process.env.MATRIX_ADMIN_ALLOWED_USERS = '@bezrabotnyi:chat.bezrabotnyi.com';
  try {
    assert.equal(await handleCommand('!bf help', '@visitor:chat.bezrabotnyi.com'), '⛔ Эта команда доступна только владельцу.');
  } finally {
    if (previous === undefined) delete process.env.MATRIX_ADMIN_ALLOWED_USERS;
    else process.env.MATRIX_ADMIN_ALLOWED_USERS = previous;
  }
});

test('Matrix client preserves text events and never echoes the bot itself', () => {
  const sync = { rooms: { join: { '!room:chat.bezrabotnyi.com': { timeline: { events: [
    { type: 'm.room.message', sender: '@owner:chat.bezrabotnyi.com', content: { msgtype: 'm.text', body: '!bf help' } },
    { type: 'm.room.message', sender: '@botfather:chat.bezrabotnyi.com', content: { msgtype: 'm.text', body: '!bf help' } },
  ] } } } } };

  assert.deepEqual(timelineMessages(sync, '@botfather:chat.bezrabotnyi.com'), [{ roomId: '!room:chat.bezrabotnyi.com', sender: '@owner:chat.bezrabotnyi.com', body: '!bf help' }]);
  assert.deepEqual(eventMessage({ body: 'Ready', html: '<b>Ready</b>', format: 'org.matrix.custom.html' }), { msgtype: 'm.text', body: 'Ready', format: 'org.matrix.custom.html', formatted_body: '<b>Ready</b>' });
});

test('BotFather discards the initial Matrix sync backlog before accepting live commands', () => {
  const state = new SyncState();
  const first = { next_batch: 'initial', rooms: { join: { '!room:chat.bezrabotnyi.com': { timeline: { events: [
    { type: 'm.room.message', sender: '@owner:chat.bezrabotnyi.com', content: { msgtype: 'm.text', body: '!bf newbot old-account' } },
  ] } } } } };
  const later = { next_batch: 'later', rooms: { join: { '!room:chat.bezrabotnyi.com': { timeline: { events: [
    { type: 'm.room.message', sender: '@owner:chat.bezrabotnyi.com', content: { msgtype: 'm.text', body: '!bf help' } },
  ] } } } } };

  assert.deepEqual(state.accept(first, '@botfather:chat.bezrabotnyi.com'), []);
  assert.equal(state.since(), 'initial');
  assert.deepEqual(state.accept(later, '@botfather:chat.bezrabotnyi.com'), [{
    roomId: '!room:chat.bezrabotnyi.com', sender: '@owner:chat.bezrabotnyi.com', body: '!bf help',
  }]);
  assert.equal(state.since(), 'later');
});

test('activating an existing BotFather account creates the full club mapping without returning its token', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'club-activation-test-'));
  const personas = path.join(root, 'personas');
  fs.mkdirSync(personas);
  const config = path.join(root, 'bot.toml');
  fs.writeFileSync(config, '[matrix]\ndemo_accounts = ["anna_k"]\n[llm]\nmodel = "test"\n');
  const envFile = path.join(root, '.env.local');
  fs.writeFileSync(envFile, 'LLM_API_KEY=keep\n');
  const activation = new ClubActivation({
    personaStore: new PersonaStore(personas, path.join(root, 'persona-history')),
    llmStore: new LlmConfigStore(config, path.join(root, 'config-history')),
    runtimeEnvFile: envFile,
    tokenFor: (username) => username === 'new_persona' ? 'hidden-token' : null,
    managedBot: (username) => username === 'new_persona',
  });

  const created = activation.activate({ username: 'new_persona', displayname: 'New Persona', prompt: 'Be useful' });

  assert.equal(created.username, 'new_persona');
  assert.equal(created.token, undefined);
  assert.equal(new LlmConfigStore(config, path.join(root, 'ignored')).demoAccounts().includes('new_persona'), true);
  assert.equal(fs.readFileSync(envFile, 'utf8').includes('MATRIX_TOKEN_NEW_PERSONA=hidden-token'), true);
  assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
});
