// ============================================
// Обработчик команд BotFather (MAS-aware)
// ============================================

const {
  createBot, refreshBotToken, resetBotPassword, deleteBot,
  listUsers, inviteUser, joinRoom, listRooms, getUserInfo,
  generatePassword, AUTH_MODE,
} = require('./adminApi');
const { getBot, getAllBots, saveBot, deleteBot: storeDeleteBot, updateBotToken, getBotCount } = require('./botStore');

function htmlEscape(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getServerName() {
  return process.env.MATRIX_SERVER_NAME;
}

function fmt(html) {
  return {
    body: html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    html,
    format: 'org.matrix.custom.html',
  };
}

// =============================================
// КОМАНДЫ
// =============================================

async function cmdNewbot(args, senderId) {
  const botName = args[0];
  if (!botName) {
    return '❌ Укажите имя бота.\nПример: <code>!newbot mybot</code>\nСоздаст @mybot:' + getServerName();
  }

  const server = getServerName();
  const displayName = args.slice(1).join(' ') || botName;
  const fullUserId = `@${botName}:${server}`;

  const existing = getBot(fullUserId);
  if (existing) {
    return `⚠️ Бот ${fullUserId} уже существует.\nИспользуйте <code>!token ${botName}</code> для получения токена.`;
  }

  try {
    const result = await createBot(botName, displayName);

    saveBot(fullUserId, {
      userId: result.userId,
      username: botName,
      password: result.password,
      displayName: result.displayName,
      token: result.token,
      createdBy: senderId,
      createdAt: new Date().toISOString(),
    });

    let reply = `✅ <b>Бот создан!</b>\n\n`;
    reply += `ID: <code>${result.userId}</code>\n`;
    reply += `Пароль: <code>${result.password}</code>\n`;
    reply += `Токен: <code>${result.token}</code>\n`;
    reply += `\n⚠️ <b>Сохраните токен</b> — compatibility token показывается один раз!\n`;
    reply += `Режим: ${AUTH_MODE === 'mas' ? 'MAS' : 'Synapse'}\n`;
    reply += `\nПовторный токен: <code>!token ${botName}</code>`;
    return fmt(reply);
  } catch (err) {
    return `❌ Ошибка создания: ${err.message}`;
  }
}

async function cmdToken(args) {
  const botName = args[0];
  if (!botName) return '❌ Укажите имя бота. Пример: <code>!token moderator</code>';

  const server = getServerName();
  const fullUserId = `@${botName}:${server}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден. Список: <code>!listbots</code>`;

  try {
    const newToken = await refreshBotToken(fullUserId, bot.password);
    updateBotToken(fullUserId, newToken);

    let reply = `🔑 <b>Токен для ${fullUserId}</b>\n\n`;
    reply += `<code>${newToken}</code>\n`;
    if (bot.password) reply += `\nПароль: <code>${bot.password}</code>`;
    reply += `\nРежим: ${AUTH_MODE === 'mas' ? 'MAS compatibility token' : 'password login'}`;
    return fmt(reply);
  } catch (err) {
    return `❌ Ошибка: ${err.message}\nПопробуйте <code>!resetpw ${botName}</code>`;
  }
}

function cmdListbots() {
  const bots = getAllBots();
  const entries = Object.entries(bots);
  if (entries.length === 0) return '📋 Нет управляемых ботов.\nСоздайте: <code>!newbot mybot</code>';

  let reply = `📋 <b>Управляемые боты (${entries.length})</b>\n`;
  reply += `Режим авторизации: <b>${AUTH_MODE === 'mas' ? 'MAS' : 'Synapse localdb'}</b>\n\n`;
  for (const [userId, bot] of entries) {
    reply += `• <b>${bot.displayName || bot.username}</b>\n`;
    reply += `  ID: <code>${userId}</code>\n`;
    reply += `  Создан: ${bot.createdAt ? new Date(bot.createdAt).toLocaleDateString('ru-RU') : '?'}\n`;
    if (bot.notes) reply += `  Заметка: ${htmlEscape(bot.notes)}\n`;
    reply += '\n';
  }
  return fmt(reply);
}

async function cmdDeletebot(args) {
  const botName = args[0];
  if (!botName) return '❌ Укажите имя бота. Пример: <code>!deletebot mybot</code>';

  const server = getServerName();
  const fullUserId = `@${botName}:${server}`;
  try {
    await deleteBot(fullUserId);
    storeDeleteBot(fullUserId);
    return `🗑️ Бот <b>${fullUserId}</b> удалён.`;
  } catch (err) {
    return `❌ Ошибка удаления: ${err.message}`;
  }
}

async function cmdResetpw(args) {
  const botName = args[0];
  if (!botName) return '❌ Укажите имя бота. Пример: <code>!resetpw mybot</code>';

  const server = getServerName();
  const fullUserId = `@${botName}:${server}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден.`;

  try {
    const newPassword = await resetBotPassword(botName);
    bot.password = newPassword;
    bot.token = null; // invalidate
    saveBot(fullUserId, bot);
    return `🔑 Пароль для <b>${fullUserId}</b> сброшен:\n<code>${newPassword}</code>\nСтарый токен больше не работает. Получите новый: <code>!token ${botName}</code>`;
  } catch (err) {
    return `❌ Ошибка: ${err.message}`;
  }
}

async function cmdInvite(args) {
  const botName = args[0];
  const roomId = args[1];
  if (!botName || !roomId) return '❌ Укажите бота и room ID.\nПример: <code>!invite moderator !roomid:server</code>';

  const server = getServerName();
  const fullUserId = `@${botName}:${server}`;
  try {
    await inviteUser(roomId, fullUserId);
    return `✅ <b>${fullUserId}</b> приглашён в ${roomId}`;
  } catch (err) {
    return `❌ Ошибка: ${err.message}`;
  }
}

async function cmdJoin(args) {
  const botName = args[0];
  const roomId = args[1];
  if (!botName || !roomId) return '❌ Укажите бота и room ID.\nПример: <code>!join moderator !roomid:server</code>';

  const server = getServerName();
  const fullUserId = `@${botName}:${server}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден.`;

  try {
    let token = bot.token;
    if (!token) {
      token = await refreshBotToken(fullUserId, bot.password);
      updateBotToken(fullUserId, token);
    }
    await joinRoom(token, roomId);
    return `✅ <b>${fullUserId}</b> присоединился к ${roomId}`;
  } catch (err) {
    return `❌ Ошибка: ${err.message}`;
  }
}

async function cmdRooms() {
  try {
    const result = await listRooms();
    const rooms = result.rooms || [];
    if (rooms.length === 0) return '📭 Нет комнат на сервере.';

    let reply = `🏠 <b>Комнаты (${rooms.length})</b>\n\n`;
    for (const room of rooms.slice(0, 20)) {
      const name = room.name || room.canonical_alias || 'без имени';
      reply += `• <b>${htmlEscape(name)}</b> <code>${room.room_id}</code> (${room.joined_members || 0} чел.)\n`;
    }
    if (rooms.length > 20) reply += `\n...и ещё ${rooms.length - 20}`;
    return fmt(reply);
  } catch (err) {
    return `❌ Ошибка: ${err.message}`;
  }
}

function cmdNote(args) {
  const botName = args[0];
  if (!botName || args.length < 2) return '❌ Укажите бота и текст.\nПример: <code>!note moderator Модератор дискуссий</code>';

  const server = getServerName();
  const fullUserId = `@${botName}:${server}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден.`;

  bot.notes = args.slice(1).join(' ');
  saveBot(fullUserId, bot);
  return `📝 Заметка для <b>${fullUserId}</b>: ${htmlEscape(bot.notes)}`;
}

function cmdInfo(args) {
  const botName = args[0];
  if (!botName) return '❌ Укажите имя бота. Пример: <code>!info moderator</code>';

  const server = getServerName();
  const fullUserId = `@${botName}:${server}`;
  const bot = getBot(fullUserId);
  if (!bot) return `❌ Бот ${botName} не найден.`;

  let reply = `🤖 <b>${fullUserId}</b>\n\n`;
  reply += `Имя: <b>${htmlEscape(bot.displayName || bot.username)}</b>\n`;
  reply += `Создан: ${bot.createdAt || '?'}\n`;
  reply += `Создатель: <code>${bot.createdBy || '?'}</code>\n`;
  reply += `Заметка: ${bot.notes ? htmlEscape(bot.notes) : '—'}\n`;
  if (bot.password) reply += `Пароль: <code>${bot.password}</code>\n`;
  if (bot.token) reply += `Токен: <code>${bot.token.substring(0, 20)}...</code>\n`;
  return fmt(reply);
}

function cmdHelp() {
  let reply = `🤖 <b>Matrix BotFather</b> (${AUTH_MODE === 'mas' ? 'MAS-режим' : 'Synapse-режим'})\n\n`;
  reply += `<code>!newbot &lt;name&gt; [display]</code> — создать бота (MAS + Synapse)\n`;
  reply += `<code>!deletebot &lt;name&gt;</code> — удалить бота\n`;
  reply += `<code>!listbots</code> — список ботов\n`;
  reply += `<code>!info &lt;name&gt;</code> — информация\n`;
  reply += `<code>!token &lt;name&gt;</code> — получить токен (MAS compat token)\n`;
  reply += `<code>!resetpw &lt;name&gt;</code> — сбросить пароль (через MAS CLI)\n`;
  reply += `<code>!invite &lt;name&gt; &lt;room&gt;</code> — пригласить в комнату\n`;
  reply += `<code>!join &lt;name&gt; &lt;room&gt;</code> — заставить зайти\n`;
  reply += `<code>!rooms</code> — комнаты сервера\n`;
  reply += `<code>!note &lt;name&gt; &lt;text&gt;</code> — заметка\n`;
  reply += `<code>!help</code> — справка`;
  return fmt(reply);
}

// =============================================
// РОУТЕР
// =============================================

function parseCommand(body) {
  const parts = body.trim().split(/\s+/);
  const prefix = parts[0].toLowerCase();
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