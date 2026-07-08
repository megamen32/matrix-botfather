// ============================================
// Synapse Admin API — управление пользователями
// ============================================

const https = require('https');
const http = require('http');

/**
 * Делает запрос к Synapse Admin API
 * @returns {Promise<object>}
 */
function adminRequest(homeserverUrl, adminToken, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, homeserverUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      rejectUnauthorized: false, // для самоподписанных сертификатов
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || parsed.errcode || data}`));
          }
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        }
      });
    });

    req.on('error', reject);

    if (postData) req.write(postData);
    req.end();
  });
}

// ============================================
// Публичные функции
// ============================================

/**
 * Логин админа и получение access token
 */
async function adminLogin(homeserverUrl, username, password) {
  return adminRequest(homeserverUrl, '', 'POST', '/_matrix/client/r0/login', {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: username },
    password,
  });
}

/**
 * Создать нового пользователя (бота)
 */
async function createUser(homeserverUrl, adminToken, username, displayName, serverName) {
  const fullUsername = username.includes(':') ? username : `${username}:${serverName}`;
  return adminRequest(homeserverUrl, adminToken, 'POST', '/_synapse/admin/v2/users/' + encodeURIComponent(fullUsername), {
    displayname: displayName || username,
    password: generatePassword(),
    admin: false,
    deactivated: false,
  });
}

/**
 * Получить список пользователей с фильтром
 */
async function listUsers(homeserverUrl, adminToken, serverName, limit = 100, offset = 0) {
  return adminRequest(
    homeserverUrl, adminToken, 'GET',
    `/_synapse/admin/v2/users?limit=${limit}&offset=${offset}&guests=false`
  );
}

/**
 * Удалить/деактивировать пользователя
 */
async function deactivateUser(homeserverUrl, adminToken, userId) {
  return adminRequest(
    homeserverUrl, adminToken, 'POST',
    '/_synapse/admin/v1/deactivate/' + encodeURIComponent(userId),
    { erase: true }
  );
}

/**
 * Сменить пароль пользователю
 */
async function resetPassword(homeserverUrl, adminToken, userId, newPassword) {
  return adminRequest(
    homeserverUrl, adminToken, 'POST',
    '/_synapse/admin/v1/reset_password/' + encodeURIComponent(userId),
    { new_password: newPassword }
  );
}

/**
 * Получить access token для пользователя (через login)
 */
async function getUserToken(homeserverUrl, userId, password) {
  const username = userId.split(':')[0].replace('@', '');
  return adminRequest(homeserverUrl, '', 'POST', '/_matrix/client/r0/login', {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: username },
    password,
  });
}

/**
 * Пригласить пользователя в комнату
 */
async function inviteUser(homeserverUrl, adminToken, roomId, userId) {
  return adminRequest(
    homeserverUrl, adminToken, 'POST',
    `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/invite`,
    { user_id: userId }
  );
}

/**
 * Присоединить бота к комнате (от имени бота)
 */
async function joinRoom(homeserverUrl, botToken, roomId) {
  return adminRequest(
    homeserverUrl, botToken, 'POST',
    `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/join`,
    {}
  );
}

/**
 * Получить список комнат на сервере
 */
async function listRooms(homeserverUrl, adminToken, limit = 50) {
  return adminRequest(
    homeserverUrl, adminToken, 'GET',
    `/_synapse/admin/v1/rooms?limit=${limit}`
  );
}

/**
 * Получить информацию о пользователе
 */
async function getUserInfo(homeserverUrl, adminToken, userId) {
  return adminRequest(
    homeserverUrl, adminToken, 'GET',
    '/_synapse/admin/v2/users/' + encodeURIComponent(userId)
  );
}

// ============================================
// Утилиты
// ============================================

function generatePassword(length = 24) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  let pass = '';
  const array = new Uint32Array(length);
  require('crypto').randomFillSync(array);
  for (let i = 0; i < length; i++) {
    pass += chars[array[i] % chars.length];
  }
  return pass;
}

module.exports = {
  adminLogin,
  createUser,
  listUsers,
  deactivateUser,
  resetPassword,
  getUserToken,
  inviteUser,
  joinRoom,
  listRooms,
  getUserInfo,
  generatePassword,
  adminRequest,
};