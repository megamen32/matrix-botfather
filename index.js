require('dotenv').config();

const { handleCommand } = require('./handlers/commands');
const { adminLogin } = require('./handlers/adminApi');
const { eventMessage, request, sendMessage } = require('./lib/matrixClient');
const { SyncState } = require('./lib/syncState');

const HOMESERVER_URL = process.env.MATRIX_HOMESERVER_URL || 'https://chat.bezrabotnyi.com';
const BOT_ACCESS_TOKEN = process.env.MATRIX_BOT_TOKEN;
const BOT_USER_ID = process.env.MATRIX_BOT_USER_ID;
const ADMIN_USER = process.env.MATRIX_ADMIN_USER;
const ADMIN_PASS = process.env.MATRIX_ADMIN_PASS;
const SERVER_NAME = process.env.MATRIX_SERVER_NAME || 'chat.bezrabotnyi.com';

async function ensureBotToken() {
  if (BOT_ACCESS_TOKEN) {
    process.env.MATRIX_ADMIN_TOKEN = BOT_ACCESS_TOKEN;
    process.env.MATRIX_BOT_USER_ID = BOT_USER_ID || `@botfather:${SERVER_NAME}`;
    process.env.MATRIX_HOMESERVER_URL = HOMESERVER_URL;
    process.env.MATRIX_SERVER_NAME = SERVER_NAME;
    return BOT_ACCESS_TOKEN;
  }
  if (ADMIN_USER && ADMIN_PASS) {
    const login = await adminLogin(HOMESERVER_URL, ADMIN_USER, ADMIN_PASS);
    process.env.MATRIX_ADMIN_TOKEN = login.access_token;
    process.env.MATRIX_HOMESERVER_URL = HOMESERVER_URL;
    process.env.MATRIX_SERVER_NAME = SERVER_NAME;
    process.env.MATRIX_BOT_USER_ID = login.user_id || `@${ADMIN_USER}:${SERVER_NAME}`;
    return login.access_token;
  }
  throw new Error('MATRIX_BOT_TOKEN or MATRIX_ADMIN_USER/MATRIX_ADMIN_PASS is required');
}

async function start() {
  const token = await ensureBotToken();
  const whoami = await request(HOMESERVER_URL, token, 'GET', '/_matrix/client/v3/account/whoami');
  const userId = whoami.user_id;
  const syncState = new SyncState();
  console.log(`Matrix BotFather ready as ${userId}`);
  while (true) {
    try {
      const since = syncState.since();
      const sync = await request(HOMESERVER_URL, token, 'GET', `/_matrix/client/v3/sync?timeout=30000${since ? `&since=${encodeURIComponent(since)}` : ''}`);
      for (const message of syncState.accept(sync, userId)) {
        try {
          const result = await handleCommand(message.body, message.sender);
          if (result) await sendMessage(HOMESERVER_URL, token, message.roomId, eventMessage(result));
        } catch (error) {
          console.error('[room.message]', error.message);
          await sendMessage(HOMESERVER_URL, token, message.roomId, eventMessage('❌ Внутренняя ошибка.')).catch(() => {});
        }
      }
    } catch (error) {
      console.error('[sync]', error.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

start().catch((error) => {
  console.error('Fatal:', error.message);
  process.exit(1);
});
