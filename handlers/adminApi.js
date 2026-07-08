// ============================================
// Admin API — Synapse Admin + MAS (Matrix Authentication Service)
// Поддержка двух режимов:
//   - synapse: чистый Synapse (локальные пароли)
//   - mas: Synapse + MAS (пароли через MAS CLI / compatibility tokens)
// ============================================

const https = require('https');
const { execSync } = require('child_process');

const AUTH_MODE = process.env.AUTH_MODE || 'mas'; // 'synapse' | 'mas'
const MAS_DOCKER_CONTAINER = process.env.MAS_DOCKER_CONTAINER || 'matrix-mas';
const MAS_CONFIG_PATH = process.env.MAS_CONFIG_PATH || '/config/config.yaml';

// ============================================
// HTTP утилита
// ============================================

function httpRequest(baseUrl, token, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : require('http');
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      rejectUnauthorized: false,
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || parsed.errcode || data.substring(0, 200)}`));
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ success: true });
          else reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ============================================
// MAS CLI обёртки (выполняются через docker exec)
// ============================================

function masCli(command) {
  try {
    const cmd = `docker exec ${MAS_DOCKER_CONTAINER} mas-cli -c ${MAS_CONFIG_PATH} ${command}`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    return result.trim();
  } catch (err) {
    throw new Error(`MAS CLI error: ${err.stderr?.trim() || err.message}`);
  }
}

function masRegisterUser(username, password) {
  const pw = password || generatePassword();
  const escapedPw = pw.replace(/'/g, "'\\''");
  masCli(`manage register-user --yes --password '${escapedPw}' ${username}`);
  return pw;
}

function masSetPassword(username, password) {
  const escapedPw = password.replace(/'/g, "'\\''");
  masCli(`manage set-password ${username} '${escapedPw}'`);
}

function masIssueToken(userId) {
  const output = masCli(`manage issue-compatibility-token ${userId}`);
  // MAS outputs the token directly
  return output.trim();
}

// ============================================
// Публичные функции (универсальные)
// ============================================

function getHomeserverUrl() {
  return process.env.MATRIX_HOMESERVER_URL;
}

function getAdminToken() {
  return process.env.MATRIX_ADMIN_TOKEN;
}

function getServerName() {
  return process.env.MATRIX_SERVER_NAME;
}

/** Логин админа */
async function adminLogin(homeserverUrl, username, password) {
  return httpRequest(homeserverUrl, '', 'POST', '/_matrix/client/r0/login', {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: username },
    password,
  });
}

/**
 * Создать нового бота
 * В MAS-режиме: Synapse user + MAS password + compatibility token
 * В Synapse-режиме: Synapse user с паролем через Admin API
 */
async function createBot(username, displayName) {
  const hs = getHomeserverUrl();
  const token = getAdminToken();
  const server = getServerName();
  const userId = `@${username}:${server}`;

  if (AUTH_MODE === 'mas') {
    // 1. Создаём/реактивируем через Synapse Admin API (без пароля)
    try {
      await httpRequest(hs, token, 'PUT', `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
        displayname: displayName || username,
        admin: false,
        deactivated: false,
      });
    } catch (err) {
      // Если пользователь стёрт (erased), нужно пересоздать
      if (err.message.includes('500')) {
        // Попробуем через MAS register
      } else {
        throw err;
      }
    }

    // 2. Регистрируем в MAS с паролем
    let password;
    try {
      password = masRegisterUser(username);
    } catch (err) {
      // Возможно пользователь уже есть в MAS — просто установим пароль
      password = generatePassword();
      try {
        masSetPassword(username, password);
      } catch (err2) {
        throw new Error(`MAS register/set-password failed: ${err.message} / ${err2.message}`);
      }
    }

    // 3. Выдаём compatibility token (надёжнее чем парольный логин)
    let compatToken;
    try {
      compatToken = masIssueToken(userId);
    } catch (err) {
      // Fallback: логин через пароль
      try {
        const login = await httpRequest(hs, '', 'POST', '/_matrix/client/r0/login', {
          type: 'm.login.password',
          identifier: { type: 'm.id.user', user: username },
          password,
        });
        compatToken = login.access_token;
      } catch (err2) {
        throw new Error(`Не удалось получить токен: MAS token=${err.message}, login=${err2.message}`);
      }
    }

    return { userId, password, token: compatToken, displayName: displayName || username };

  } else {
    // Synapse-only mode
    const password = generatePassword();
    await httpRequest(hs, token, 'PUT', `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
      displayname: displayName || username,
      password,
      admin: false,
      deactivated: false,
    });

    const login = await httpRequest(hs, '', 'POST', '/_matrix/client/r0/login', {
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: username },
      password,
    });

    return { userId, password, token: login.access_token, displayName: displayName || username };
  }
}

/** Получить свежий токен для существующего бота */
async function refreshBotToken(userId, password) {
  const hs = getHomeserverUrl();

  if (AUTH_MODE === 'mas') {
    // Сначала пробуем issue-compatibility-token
    try {
      const compatToken = masIssueToken(userId);
      return compatToken;
    } catch {
      // Fallback: парольный логин
    }
  }

  const username = userId.split(':')[0].replace('@', '');
  const login = await httpRequest(hs, '', 'POST', '/_matrix/client/r0/login', {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: username },
    password,
  });
  return login.access_token;
}

/** Сменить пароль бота */
async function resetBotPassword(username, newPassword) {
  if (AUTH_MODE === 'mas') {
    const pw = newPassword || generatePassword();
    masSetPassword(username, pw);
    return pw;
  } else {
    const hs = getHomeserverUrl();
    const token = getAdminToken();
    const server = getServerName();
    const userId = `@${username}:${server}`;
    const pw = newPassword || generatePassword();
    await httpRequest(hs, token, 'POST', `/_synapse/admin/v1/reset_password/${encodeURIComponent(userId)}`, {
      new_password: pw,
    });
    return pw;
  }
}

/** Удалить бота */
async function deleteBot(userId) {
  const hs = getHomeserverUrl();
  const token = getAdminToken();

  // Деактивируем через Synapse Admin API
  try {
    await httpRequest(hs, token, 'POST', `/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`, {
      erase: true,
    });
  } catch (err) {
    // v1 может не работать, пробуем v2 DELETE
    try {
      await httpRequest(hs, token, 'DELETE', `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
    } catch (err2) {
      throw new Error(`Deactivate failed: ${err.message} / ${err2.message}`);
    }
  }
}

/** Список пользователей */
async function listUsers(limit = 100, offset = 0) {
  const hs = getHomeserverUrl();
  const token = getAdminToken();
  return httpRequest(hs, token, 'GET', `/_synapse/admin/v2/users?limit=${limit}&offset=${offset}&guests=false`);
}

/** Пригласить в комнату */
async function inviteUser(roomId, userId) {
  const hs = getHomeserverUrl();
  const token = getAdminToken();
  return httpRequest(hs, token, 'POST', `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/invite`, {
    user_id: userId,
  });
}

/** Присоединить бота к комнате */
async function joinRoom(botToken, roomId) {
  const hs = getHomeserverUrl();
  return httpRequest(hs, botToken, 'POST', `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/join`, {});
}

/** Список комнат */
async function listRooms(limit = 50) {
  const hs = getHomeserverUrl();
  const token = getAdminToken();
  return httpRequest(hs, token, 'GET', `/_synapse/admin/v1/rooms?limit=${limit}`);
}

/** Информация о пользователе */
async function getUserInfo(userId) {
  const hs = getHomeserverUrl();
  const token = getAdminToken();
  return httpRequest(hs, token, 'GET', `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
}

// ============================================
// Утилиты
// ============================================

function generatePassword(length = 24) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  let pass = '';
  const array = new Uint32Array(length);
  require('crypto').randomFillSync(array);
  for (let i = 0; i < length; i++) pass += chars[array[i] % chars.length];
  return pass;
}

module.exports = {
  AUTH_MODE,
  adminLogin, createBot, refreshBotToken, resetBotPassword, deleteBot,
  listUsers, inviteUser, joinRoom, listRooms, getUserInfo,
  generatePassword, httpRequest,
};