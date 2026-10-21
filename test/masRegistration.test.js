const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const childProcess = require('node:child_process');
const https = require('node:https');

const envKeys = ['AUTH_MODE', 'MATRIX_HOMESERVER_URL', 'MATRIX_ADMIN_TOKEN', 'MATRIX_SERVER_NAME'];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const previousExecSync = childProcess.execSync;
const previousHttpsRequest = https.request;
const operations = [];
let registerMode = 'success';
let demoteMode = 'success';
let profileRequest;

process.env.AUTH_MODE = 'mas';
process.env.MATRIX_HOMESERVER_URL = 'https://matrix.test';
process.env.MATRIX_ADMIN_TOKEN = 'unit-test-admin-token';
process.env.MATRIX_SERVER_NAME = 'chat.test';
childProcess.execSync = (command) => {
  if (command.includes('manage register-user')) {
    operations.push('mas-register');
    if (registerMode === 'existing') throw new Error('user already exists');
    operations.push(command.includes("--display-name 'Test Bot'") ? 'mas-register-has-display-name' : 'mas-register-missing-display-name');
    operations.push(command.includes('--no-admin') ? 'mas-register-no-admin' : 'mas-register-admin-flag-missing');
    return 'registered';
  }
  if (command.includes('manage demote-admin')) {
    operations.push('mas-demote');
    if (demoteMode === 'fail') throw new Error('demotion failed');
    return 'demoted';
  }
  if (command.includes('manage set-password')) {
    operations.push('mas-set-password');
    return 'password set';
  }
  if (command.includes('manage unlock-user')) {
    operations.push('mas-unlock');
    return 'unlocked';
  }
  if (command.includes('manage issue-compatibility-token')) {
    operations.push(command.trim().endsWith('test_bot') ? 'mas-token-localpart' : 'mas-token-invalid-argument');
    return 'unit-test-compat-token';
  }
  throw new Error('unexpected MAS command');
};
https.request = (options, callback) => {
  if (options.path.includes('/_matrix/client/v3/profile/')) {
    operations.push('http-profile');
    profileRequest = { path: options.path, authorization: options.headers.Authorization, body: '' };
    const request = new EventEmitter();
    request.write = (body) => { profileRequest.body += body; };
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      callback(response);
      process.nextTick(() => {
        response.emit('data', Buffer.from('{}'));
        response.emit('end');
      });
    };
    return request;
  }

  operations.push(`http-${options.method}`);
  const request = new EventEmitter();
  request.write = () => {};
  request.end = () => {
    const response = new EventEmitter();
    response.statusCode = 200;
    callback(response);
    process.nextTick(() => {
      response.emit('data', Buffer.from('{}'));
      response.emit('end');
    });
  };
  return request;
};

const adminApiPath = require.resolve('../handlers/adminApi');
delete require.cache[adminApiPath];
const { createBot } = require('../handlers/adminApi');

test.after(() => {
  childProcess.execSync = previousExecSync;
  https.request = previousHttpsRequest;
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete require.cache[adminApiPath];
});

test.beforeEach(() => {
  operations.length = 0;
  profileRequest = undefined;
});

test('MAS registration sets display name without re-creating the Synapse account', async () => {
  registerMode = 'success';

  const bot = await createBot('test_bot', 'Test Bot');

  assert.equal(bot.userId, '@test_bot:chat.test');
  assert.ok(operations.includes('mas-register-has-display-name'));
  assert.ok(operations.includes('mas-register-no-admin'));
  assert.equal(operations.includes('http-PUT'), false, `unexpected operations: ${operations.join(', ')}`);
  assert.equal(operations.at(-1), 'mas-token-localpart');
});

test('an existing MAS account gets its profile updated with its own compatibility token', async () => {
  registerMode = 'existing';

  const bot = await createBot('test_bot', 'Test Bot');

  assert.equal(bot.userId, '@test_bot:chat.test');
  assert.ok(operations.includes('mas-demote'));
  assert.ok(operations.includes('mas-set-password'));
  assert.ok(operations.includes('mas-unlock'));
  assert.ok(operations.indexOf('mas-demote') < operations.indexOf('mas-set-password'), `demotion must precede credential rotation: ${operations.join(', ')}`);
  assert.equal(operations.includes('http-PUT'), false, `unexpected operations: ${operations.join(', ')}`);
  assert.equal(profileRequest.authorization, 'Bearer unit-test-compat-token');
  assert.equal(decodeURIComponent(profileRequest.path), '/_matrix/client/v3/profile/@test_bot:chat.test/displayname');
  assert.deepEqual(JSON.parse(profileRequest.body), { displayname: 'Test Bot' });
});


test('invalid Matrix localparts are rejected before MAS or Synapse side effects', async () => {
  registerMode = 'success';
  for (const username of ['bad;touch', 'bad name', "bad'quoted", 'bad$(id)', 'bad\nname', 'BadCase', 'bad/name', 'bad+name']) {
    await assert.rejects(createBot(username, 'Test Bot'), /invalid Matrix username/i, `accepted unsafe localpart: ${username}`);
  }
  assert.deepEqual(operations, []);
});

test('an existing MAS admin is demoted before its credentials can be rotated', async () => {
  registerMode = 'existing';
  demoteMode = 'fail';

  await assert.rejects(createBot('test_bot', 'Test Bot'), /demotion failed/);

  assert.deepEqual(operations, ['mas-register', 'mas-demote']);
  assert.equal(operations.includes('mas-set-password'), false);
  assert.equal(operations.includes('mas-token-localpart'), false);
  assert.equal(profileRequest, undefined);
});
