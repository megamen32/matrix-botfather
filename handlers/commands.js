// ============================================
// Обработчик команд BotFather
// ============================================

const {
  createUser, listUsers, deactivateUser,
  getUserToken, inviteUser, joinRoom, listRooms,
  generatePassword, adminLogin,
} = require('./adminApi');
const { getBot, getAllBots, saveBot, deleteBot, updateBotToken, getBotCount } = require('./botStore');

// Конфиг из env
function getConfig() {
  return {
    homeserverUrl: process.env.MATRIX_HOMESERVER_URL,
    adminToken: process.env.MATRIX_ADMIN_TOKEN,
    serverName: process.env.MATRIX_SERVER_NAME,
    botUserId: process.env.MATRIX_BOT_USER_ID,
  };
}

function htmlEscape(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function toHtml(text) {
  return htmlEscape(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
}

// =============================================
// КОМАНДЫ
// =============================================

/**
 * !newbot <username> [display_name]
 * Создаёт бота, логинится, сохраняет токен
 */
async function cmdNewbot(args, senderId) {
  const botName = args[0];
  if (!botName) {
    return '❌ Укажите имя бота.\nПример: <code>!newbot moderator</code>\nСоздаст @moderator:bezrabotnyi.com';
  }

  const config = getConfig();
  const displayName = args.slice(1).join(' ') || botName;
  const fullUserId = `@${botName}:${config.serverName}`;

  // Проверяем не существует ли
  const existing = getBot(fullUserId);
  if (existing) {
    return `⚠️ Бот ${fullUserId} уже существует.\nИспользуйте <code>!token ${botName}</code> для получения токена.`;
  }

  try {
    // 1. Создаём пользователя через Admin API
    await createUser(config.homeserverUrl, config.adminToken, botName, displayName, config.serverName);

    // 2. Получаем пароль из созданного пользователя — regen
    const { getUserInfo } = require('./adminApi');
    // Пароль генерируется при создании, но API его не возвращает. Сбросим.
    const newPassword = generatePassword();
    await require('./adminApi').resetPassword(config.homeserverUrl, config.adminToken, fullUserId, newPassword);

    // 3. Логинимся как бот чтобы получить токен
    const loginResult = await getUserToken(config.homeserverUrl, fullUserId, newPassword);

    // 4. Сохраняем
    saveBot(fullUserId, {
      userId: fullUserId,
      username: botName,
      password: newPassword,
      displayName,
      token: loginResult.access_token,
      createdBy: senderId,
      createdAt: new Date().toISOString(),
    });

    let reply = `✅ <b>Бот создан!</b>\n\n`;
    reply += `ID: <code>${fullUserId}</code>\n`;
    reply += `Пароль: <code>${newPassword}</code>\n`;
    reply += `Токен: <code>${loginResult.access_token}</code>\n`;
    reply += `\n⚠️ <b>Сохраните токен</b> — он показывается только один раз!\n`;
    reply += `Используйте <code>!token ${botName}</code> для повторного получения.`;

    return { body: reply.replace(/<\/?[^>]+(>|$)/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), html: reply, format: 'org.matrix.custom.html' };
  } catch (err) {
    return `❌ Ошибка создания бота: ${err.message}`;
  }
}

/**
 * !token <username>
 * Показать/обновить токен бота
 */
async function cmdToken(args) {
  const botName = args[0];
  if (!botName) return '❌ Укажите имя бота. Пример: <code>!token moderator</code>';

  const config = getConfig();
  const fullUserId = `@${botName}:${config.serverName}`;
  const bot = getBot(fullUserId);

  if (!bot) return `❌ Бот ${botName} не найден. Список: <code>!listbots</code>`;

  try {
    // Повторный логин чтобы получить свежий токен
    const loginResult = await getUserToken(config.homeserverUrl, fullUserId, bot.password);
    updateBotToken(fullUserId, loginResult.access_token);

    let reply = `🔑 <b>Токен для ${fullUserId}</b>\n\n`;
    reply += `<code>${loginResult.access_token}</code>\n`;
    reply += `\nПароль: <code>${bot.password}</code>`;
    return { body: reply.replace(/<\/?[^>]+(>|$)/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), html: reply, format: 'org.matrix.custom.html' };
  } catch (err) {
    return `❌ Ошибка получения токена: ${err.message}\nВозможно пароль был сброшен. Используйте <code>!resetpw ${botName}</code>`;
  }
}

/**
 * !listbots
 * Список всех управляемых ботов
 */
function cmdListbots() {
  const bots = getAllBots();
  const entries = Object.entries(bots);

  if (entries.length === 0) {
    return '📋 Нет управляемых ботов.\nСоздайте: <code>!newbot mybot</code>';
  }

  let reply = `📋 <b>Управляемые боты (${entries.length})</b>\n\n`;
  for (const [userId, bot] of entries) {
    reply += `• <b>${bot.displayName || bot.username}</b>\n`;
    reply += `  ID: <code>${userId}</code>\n`;
    reply += `  Создан: ${bot.createdAt ? new Date(bot.createdAt).toLocaleDateString('ru-RU') : '?'}\n`;
    if (bot.notes) reply += `  Заметка: ${htmlEscape(bot.notes)}\n`;
    reply += '\n';
  }

  return { body: reply.replace(/<\/?[^>]+(>|$)/g, ''), html: reply, format: 'org.matrix.custom.html' };
}

/**
 * !deletebot <username>
 * Удалить бота с сервера
 */
async function cmdDeletebot(args) {
  const botName = args[0];
  if (!botName) return '❌ Укажите имя бота. Пример: <code>!deletebot mybot</code>';

  const config = getConfig();
  const fullUserId = `@${botName}:${config.serverName}`;

  try {
    await deactivateUser(config.homeserverUrl, config.adminToken, fullUserId);
    deleteBot(fullUserId);
    return `🗑️ Бот <b>${fullUserId}</b> удалён.`;
  } catch (err) {
    return `❌ Ошибка удаления: ${err.message}`;
  }
}

/**
 * !resetpw <username>
 * Сбросить пароль бота
 */
async function cmdResetpw(args) {
  const botName = args[0];
  if (!botName) return '❌ Укажите имя бота. Пример: <code>!resetpw mybot</code>';

  const config = getConfig();
  const fullUserId = `@${botName}:${config.serverName}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден.`;

  const newPassword = generatePassword();
  try {
    await require('./adminApi').resetPassword(config.homeserverUrl, config.adminToken, fullUserId, newPassword);
    // Обновляем в хранилище
    bot.password = newPassword;
    saveBot(fullUserId, bot);

    return `🔑 Пароль для <b>${fullUserId}</b> сброшен:\n<code>${newPassword}</code>\nСтарый токен больше не работает. Используйте <code>!token ${botName}</code>`;
  } catch (err) {
    return `❌ Ошибка: ${err.message}`;
  }
}

/**
 * !invite <bot> <room_id>
 * Пригласить бота в комнату
 */
async function cmdInvite(args) {
  const botName = args[0];
  const roomId = args[1];
  if (!botName || !roomId) return '❌ Укажите бота и room ID.\nПример: <code>!invite moderator !roomid:server</code>';

  const config = getConfig();
  const fullUserId = `@${botName}:${config.serverName}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден.`;

  try {
    await inviteUser(config.homeserverUrl, config.adminToken, roomId, fullUserId);
    return `✅ <b>${fullUserId}</b> приглашён в ${roomId}`;
  } catch (err) {
    return `❌ Ошибка приглашения: ${err.message}`;
  }
}

/**
 * !join <bot> <room_id>
 * Заставить бота присоединиться к комнате (нужен токен бота)
 */
async function cmdJoin(args) {
  const botName = args[0];
  const roomId = args[1];
  if (!botName || !roomId) return '❌ Укажите бота и room ID.\nПример: <code>!join moderator !roomid:server</code>';

  const config = getConfig();
  const fullUserId = `@${botName}:${config.serverName}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден.`;

  try {
    // Получаем свежий токен
    const loginResult = await getUserToken(config.homeserverUrl, fullUserId, bot.password);
    updateBotToken(fullUserId, loginResult.access_token);

    await joinRoom(config.homeserverUrl, loginResult.access_token, roomId);
    return `✅ <b>${fullUserId}</b> присоединился к ${roomId}`;
  } catch (err) {
    return `❌ Ошибка: ${err.message}`;
  }
}

/**
 * !rooms
 * Список комнат на сервере
 */
async function cmdRooms() {
  const config = getConfig();
  try {
    const result = await listRooms(config.homeserverUrl, config.adminToken);
    const rooms = result.rooms || [];

    if (rooms.length === 0) return '📭 Нет комнат на сервере.';

    let reply = `🏠 <b>Комнаты на сервере (${rooms.length})</b>\n\n`;
    for (const room of rooms) {
      const name = room.name || room.canonical_alias || 'без имени';
      const members = room.joined_members || 0;
      reply += `• <b>${htmlEscape(name)}</b>\n`;
      reply += `  ID: <code>${room.room_id}</code>\n`;
      reply += `  Участников: ${members}\n\n`;
    }

    return { body: reply.replace(/<\/?[^>]+(>|$)/g, ''), html: reply, format: 'org.matrix.custom.html' };
  } catch (err) {
    return `❌ Ошибка: ${err.message}`;
  }
}

/**
 * !note <bot> <текст>
 * Добавить заметку к боту
 */
function cmdNote(args) {
  const botName = args[0];
  if (!botName) return '❌ Укажите бота. Пример: <code>!note moderator Модератор дискуссий</code>';

  const config = getConfig();
  const fullUserId = `@${botName}:${config.serverName}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден.`;

  const note = args.slice(1).join(' ');
  bot.notes = note;
  saveBot(fullUserId, bot);
  return `📝 Заметка для <b>${fullUserId}</b> обновлена: ${htmlEscape(note)}`;
}

/**
 * !info <bot>
 * Подробная информация о боте
 */
async function cmdInfo(args) {
  const botName = args[0];
  if (!botName) return '❌ Укажите имя бота. Пример: <code>!info moderator</code>';

  const config = getConfig();
  const fullUserId = `@${botName}:${config.serverName}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден в управлении.`;

  let reply = `🤖 <b>Информация о ${fullUserId}</b>\n\n`;
  reply += `Имя: <b>${htmlEscape(bot.displayName || bot.username)}</b>\n`;
  reply += `Создан: ${bot.createdAt || '?'}\n`;
  reply += `Создатель: <code>${bot.createdBy || '?'}</code>\n`;
  reply += `Заметка: ${bot.notes ? htmlEscape(bot.notes) : '—'}\n`;
  reply += `\nПароль: <code>${bot.password}</code>`;

  return { body: reply.replace(/<\/?[^>]+(>|$)/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), html: reply, format: 'org.matrix.custom.html' };
}

/**
 * !help
 */
function cmdHelp() {
  let reply = `🤖 <b>Matrix BotFather</b> — управление бот-аккаунтами\n\n`;
  reply += `<code>!newbot &lt;name&gt; [display]</code> — создать бота\n`;
  reply += `<code>!deletebot &lt;name&gt;</code> — удалить бота\n`;
  reply += `<code>!listbots</code> — список ботов\n`;
  reply += `<code>!info &lt;name&gt;</code> — информация о боте\n`;
  reply += `<code>!token &lt;name&gt;</code> — получить токен\n`;
  reply += `<code>!resetpw &lt;name&gt;</code> — сбросить пароль\n`;
  reply += `<code>!invite &lt;name&gt; &lt;room_id&gt;</code> — пригласить в комнату\n`;
  reply += `<code>!join &lt;name&gt; &lt;room_id&gt;</code> — заставить зайти в комнату\n`;
  reply += `<code>!rooms</code> — список комнат сервера\n`;
  reply += `<code>!note &lt;name&gt; &lt;text&gt;</code> — заметка к боту\n`;
  reply += `<code>!help</code> — эта справка`;
  return { body: reply.replace(/<\/?[^>]+(>|$)/g, ''), html: reply, format: 'org.matrix.custom.html' };
}

// =============================================
// РОУТЕР
// =============================================

function parseCommand(body) {
  const parts = body.trim().split(/\s+/);
  const prefix = parts[0].toLowerCase();
  // Принимаем ! или !bf
  if (prefix === '!botfather' || prefix === '!bf') {
    return { subcommand: (parts[1] || '').toLowerCase(), args: parts.slice(2) };
  }
  return null;
}

async function handleCommand(body, senderId) {
  const parsed = parseCommand(body);
  if (!parsed) return null;

  const { subcommand, args } = parsed;

  switch (subcommand) {
    case 'newbot': case 'create': return cmdNewbot(args, senderId);
    case 'token': return cmdToken(args);
    case 'list': case 'listbots': return cmdListbots();
    case 'delete': case 'deletebot': case 'remove': return cmdDeletebot(args);
    case 'resetpw': case 'password': return cmdResetpw(args);
    case 'invite': return cmdInvite(args);
    case 'join': return cmdJoin(args);
    case 'rooms': return cmdRooms();
    case 'note': return cmdNote(args);
    case 'info': return cmdInfo(args);
    case 'help': case 'хелп': case 'помощь': case '': return cmdHelp();
    default: return `❌ Неизвестная команда: ${subcommand}\n<code>!bf help</code> — справка.`;
  }
}

module.exports = { handleCommand, parseCommand };