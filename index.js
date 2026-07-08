// ============================================
// Matrix BotFather — Главный файл
// ============================================

require('dotenv').config();
const { MatrixClient, SimpleFsStorageProvider } = require('matrix-bot-sdk');
const { handleCommand } = require('./handlers/commands');
const { adminLogin } = require('./handlers/adminApi');
const path = require('path');
const fs = require('fs');

// ---- Конфиг ----
const HOMESERVER_URL = process.env.MATRIX_HOMESERVER_URL || 'https://chat.bezrabotnyi.com';
const BOT_ACCESS_TOKEN = process.env.MATRIX_BOT_TOKEN;
const BOT_USER_ID = process.env.MATRIX_BOT_USER_ID;
const ADMIN_USER = process.env.MATRIX_ADMIN_USER;
const ADMIN_PASS = process.env.MATRIX_ADMIN_PASS;
const SERVER_NAME = process.env.MATRIX_SERVER_NAME || 'bezrabotnyi.com';
const STORAGE_PATH = path.join(__dirname, 'bot-storage.json');

// Если токен бота не задан — логинимся админом и создаём/логиним бота
async function ensureBotToken() {
  // Если токен задан напрямую — используем его
  if (BOT_ACCESS_TOKEN) {
    console.log('✅ Токен бота из .env');
    process.env.MATRIX_ADMIN_TOKEN = BOT_ACCESS_TOKEN;
    process.env.MATRIX_BOT_USER_ID = BOT_USER_ID || `@botfather:${SERVER_NAME}`;
    process.env.MATRIX_HOMESERVER_URL = HOMESERVER_URL;
    process.env.MATRIX_SERVER_NAME = SERVER_NAME;
    return BOT_ACCESS_TOKEN;
  }

  // Иначе логинимся админом чтобы получить токен для управления
  if (ADMIN_USER && ADMIN_PASS) {
    console.log(`🔑 Логин как админ (${ADMIN_USER})...`);
    try {
      const loginResult = await adminLogin(HOMESERVER_URL, ADMIN_USER, ADMIN_PASS);
      console.log(`✅ Админ авторизован`);
      process.env.MATRIX_ADMIN_TOKEN = loginResult.access_token;
      process.env.MATRIX_HOMESERVER_URL = HOMESERVER_URL;
      process.env.MATRIX_SERVER_NAME = SERVER_NAME;
      process.env.MATRIX_BOT_USER_ID = loginResult.user_id || `@${ADMIN_USER}:${SERVER_NAME}`;
      return loginResult.access_token;
    } catch (err) {
      console.error('❌ Ошибка авторизации админа:', err.message);
      process.exit(1);
    }
  }

  console.error('❌ Задайте MATRIX_BOT_TOKEN или MATRIX_ADMIN_USER + MATRIX_ADMIN_PASS в .env');
  process.exit(1);
}

// ---- Запуск ----
async function start() {
  console.log('🤖 Matrix BotFather启动...');

  const token = await ensureBotToken();
  const userId = process.env.MATRIX_BOT_USER_ID;

  // Убедимся что директория data/ существует
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const storage = new SimpleFsStorageProvider(STORAGE_PATH);
  const client = new MatrixClient(HOMESERVER_URL, token, storage);

  // Обработка сообщений
  client.on('room.message', async (roomId, event) => {
    if (event.sender === userId) return;
    if (event.content?.msgtype !== 'm.text') return;

    const body = event.content.body || '';
    const senderId = event.sender;

    try {
      const result = await handleCommand(body, senderId);
      if (!result) return;

      if (typeof result === 'object' && result.format) {
        // Sanitize body from HTML
        const cleanBody = result.body
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/?[^>]+(>|$)/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');
        await client.sendHtmlMessage(roomId, cleanBody, result.html);
      } else {
        const cleanBody = result
          .replace(/<\/?[^>]+(>|$)/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        await client.sendTextMessage(roomId, cleanBody);
      }
    } catch (err) {
      console.error('[room.message] Error:', err.message);
      await client.sendTextMessage(roomId, `❌ Внутренняя ошибка: ${err.message}`).catch(() => {});
    }
  });

  // Whoami
  try {
    const whoami = await client.getWhoami();
    console.log(`🤖 BotFather: ${whoami.user_id}`);
  } catch (err) {
    console.error('❌ Ошибка подключения:', err.message);
    process.exit(1);
  }

  console.log('📡 Ожидаю команды...');
  console.log('   !bf help — справка');
  console.log('   !bf newbot <name> — создать бота');

  client.start()
    .then(() => console.log('✅ Синхронизация началась'))
    .catch(err => console.error('❌ Ошибка синхронизации:', err.message));
}

start().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});