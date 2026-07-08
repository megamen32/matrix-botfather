// ============================================
// Хранилище данных ботов (JSON-файл)
// ============================================

const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, '..', 'data', 'bots.json');

const DEFAULT_DATA = {
  bots: {},   // { "botname:server": { userId, password, displayName, createdAt, token, notes } }
};

function loadData() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
      return { ...DEFAULT_DATA, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('[botStore] Error loading data:', err.message);
  }
  return { ...DEFAULT_DATA };
}

function saveData(data) {
  const dir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getBot(userId) {
  const data = loadData();
  return data.bots[userId] || null;
}

function getAllBots() {
  const data = loadData();
  return data.bots;
}

function saveBot(userId, botData) {
  const data = loadData();
  data.bots[userId] = {
    ...botData,
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
    return true;
  }
  return false;
}

function updateBotToken(userId, token) {
  const data = loadData();
  if (data.bots[userId]) {
    data.bots[userId].token = token;
    data.bots[userId].updatedAt = new Date().toISOString();
    saveData(data);
    return true;
  }
  return false;
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
  getBotCount,
};