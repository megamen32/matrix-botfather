require('dotenv').config();
const https = require('https');
const crypto = require('crypto');

const HOMESERVER = 'https://chat.bezrabotnyi.com';
const ADMIN_USER = process.env.MATRIX_ADMIN_USER;
const ADMIN_PASS = process.env.MATRIX_ADMIN_PASS;
const BOT_USERNAME = 'moderator';
const SERVER = 'chat.bezrabotnyi.com';

function generatePassword(length = 24) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  let pass = '';
  const arr = new Uint32Array(length);
  crypto.randomFillSync(arr);
  for (let i = 0; i < length; i++) pass += chars[arr[i] % chars.length];
  return pass;
}

function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, HOMESERVER);
    const postData = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = https.request({
      hostname: url.hostname, port: 443, path: url.pathname + url.search,
      method, headers, rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || data.substring(0, 200)}`));
        } catch { reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('\n🤖 Создание бота-модератора для ' + HOMESERVER + '\n');
  console.log('1️⃣ Логин как админ...');
  const adminLogin = await request('POST', '/_matrix/client/r0/login', null, {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: ADMIN_USER },
    password: ADMIN_PASS,
  });
  console.log('   ✅ Админ: ' + adminLogin.user_id);

  const botUserId = '@' + BOT_USERNAME + ':' + SERVER;
  const botPassword = generatePassword();
  console.log('2️⃣ Создание пользователя ' + botUserId + '...');
  try {
    await request('PUT', '/_synapse/admin/v2/users/' + encodeURIComponent(botUserId), adminLogin.access_token, {
      displayname: 'Модератор дискуссий',
      password: botPassword,
      admin: false,
      deactivated: false,
    });
    console.log('   ✅ Пользователь создан');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('   ⚠️ Уже существует, сбрасываю пароль...');
      await request('POST', '/_synapse/admin/v1/reset_password/' + encodeURIComponent(botUserId), adminLogin.access_token, { new_password: botPassword });
      console.log('   ✅ Пароль сброшен');
    } else throw err;
  }

  console.log('3️⃣ Получение access token...');
  const botLogin = await request('POST', '/_matrix/client/r0/login', null, {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: BOT_USERNAME },
    password: botPassword,
  });
  console.log('   ✅ Токен получен');

  console.log('\n' + '='.repeat(50));
  console.log('🎉 БОТ-МОДЕРАТОР ГОТОВ');
  console.log('='.repeat(50));
  console.log('\nUser ID:    ' + botUserId);
  console.log('Password:   ' + botPassword);
  console.log('Token:      ' + botLogin.access_token);
  console.log('\nДля .env:');
  console.log('MATRIX_HOMESERVER_URL=' + HOMESERVER);
  console.log('MATRIX_ACCESS_TOKEN=' + botLogin.access_token);
  console.log('MATRIX_BOT_USER_ID=' + botUserId);
  console.log('');
}

main().catch(err => {
  console.error('\n❌ ОШИБКА: ' + err.message);
  process.exit(1);
});