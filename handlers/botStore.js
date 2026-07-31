// ============================================
// Хранилище данных ботов (JSON-файл)
// ============================================

const fs = require('fs');
const path = require('path');
const { SecretVault } = require('../lib/secretVault');

function storageFile() {
  return process.env.BOTFATHER_REGISTRY_FILE || path.join(__dirname, '..', 'data', 'bots.json');
}

function vaultFile() {
  return process.env.BOTFATHER_VAULT_FILE || path.join(__dirname, '..', 'data', 'secrets.enc');
}

const DEFAULT_DATA = {
  bots: {},   // { "botname:server": { userId, password, displayName, createdAt, token, notes } }
};

function loadData() {
  try {
    if (fs.existsSync(storageFile())) {
      const raw = fs.readFileSync(storageFile(), 'utf-8');
      return { ...DEFAULT_DATA, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('[botStore] Error loading data:', err.message);
  }
  return { ...DEFAULT_DATA };
}

function saveData(data) {
  const file = storageFile();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function vault() {
  return new SecretVault(vaultFile(), process.env.CONTROL_PLANE_MASTER_KEY);
}

function publicBot(bot) {
  const { password, token, ...metadata } = bot;
  return metadata;
}

function getBot(userId) {
  const data = loadData();
  return data.bots[userId] ? publicBot(data.bots[userId]) : null;
}

function getAllBots() {
  const data = loadData();
  return Object.fromEntries(Object.entries(data.bots).map(([userId, bot]) => [userId, publicBot(bot)]));
}

function saveBot(userId, botData) {
  const data = loadData();
  const { password, token, ...metadata } = botData;
  if (password !== undefined || token !== undefined) {
    const current = vault().get(userId) || {};
    vault().put(userId, { ...current, ...(password !== undefined ? { password } : {}), ...(token !== undefined ? { token } : {}) });
  }
  data.bots[userId] = {
    ...metadata,
    updatedAt: new Date().toISOString(),
  };
  saveData(data);
  return data.bots[userId];
}

function deleteBot(userId) {
  const data = loadData();
  if (data.bots[userId]) {
    delete data.bots[userId];
    saveData(data);
    if (process.env.CONTROL_PLANE_MASTER_KEY) vault().delete(userId);
    return true;
  }
  return false;
}

function updateBotToken(userId, token) {
  const data = loadData();
  if (data.bots[userId]) {
    vault().put(userId, { ...(vault().get(userId) || {}), token });
    data.bots[userId].updatedAt = new Date().toISOString();
    saveData(data);
    return true;
  }
  return false;
}

function getBotCredentials(userId) {
  return vault().get(userId);
}

function migrateLegacySecrets() {
  const data = loadData();
  const secrets = vault().load();
  let migrated = 0;
  for (const [userId, bot] of Object.entries(data.bots)) {
    if (bot.password !== undefined || bot.token !== undefined) {
      secrets[userId] = { ...(secrets[userId] || {}), ...(bot.password !== undefined ? { password: bot.password } : {}), ...(bot.token !== undefined ? { token: bot.token } : {}) };
      delete bot.password;
      delete bot.token;
      migrated += 1;
    }
  }
  if (migrated) {
    vault().save(secrets);
    saveData(data);
  }
  return migrated;
}

function getBotCount() {
  const data = loadData();
  return Object.keys(data.bots).length;
}

module.exports = {
  getBot,
  getAllBots,
  saveBot,
  deleteBot,
  updateBotToken,
  getBotCredentials,
  migrateLegacySecrets,
  getBotCount,
};
