const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { BotSettingsStore } = require('../lib/botSettingsStore');
const { PersonaStore } = require('../lib/personaStore');
const { createAdminServer } = require('../admin/server');

test('Matrix bot settings update is validated, persisted and revisioned', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-bot-settings-test-'));
  const file = path.join(root, 'bot.toml');
  fs.writeFileSync(file, '[bot]\ninterval_min = 20\ninterval_max = 40\nreply_probability = 0.6\n[typing]\nspeed_cps = 5\n');
  const store = new BotSettingsStore(file, path.join(root, 'history'));
  const updated = store.update({ bot: { interval_min: 3, reply_probability: 0.8 }, typing: { speed_cps: 7 } });
  assert.equal(updated.bot.interval_min, 3);
  assert.equal(updated.bot.reply_probability, 0.8);
  assert.equal(updated.typing.speed_cps, 7);
  assert.equal(store.document().bot.interval_max, 40);
  assert.equal(fs.readdirSync(path.join(root, 'history')).length, 1);
  assert.throws(() => store.update({ bot: { reply_probability: 2 } }), /invalid reply_probability/);
});

test('admin API exposes Matrix bot settings without exposing unrelated config', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-bot-api-test-'));
  const personas = path.join(root, 'personas');
  fs.mkdirSync(personas);
  const config = path.join(root, 'bot.toml');
  fs.writeFileSync(config, '[bot]\ninterval_min = 20\ninterval_max = 40\nreply_probability = 0.6\n[matrix]\nadmin_token_env = "MATRIX_ADMIN_TOKEN"\n');
  const server = createAdminServer({ personaStore: new PersonaStore(personas, path.join(root, 'history')), botSettingsStore: new BotSettingsStore(config, path.join(root, 'history')) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const listed = await fetch(`${base}/api/bot-settings`);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).bot.interval_min, 20);
  const updated = await fetch(`${base}/api/bot-settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bot: { interval_min: 3 } }) });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).bot.interval_min, 3);
});
