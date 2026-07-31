const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const TOML = require('@iarna/toml');

const FIELDS = new Set(['model', 'temperature', 'top_p', 'max_tokens', 'request_timeout_sec', 'max_retries', 'retry_backoff_ms']);

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, value, { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

class LlmConfigStore {
  constructor(file, historyDirectory) {
    this.file = file;
    this.historyDirectory = historyDirectory;
  }

  read() {
    return TOML.parse(fs.readFileSync(this.file, 'utf8')).llm || {};
  }

  document() {
    return TOML.parse(fs.readFileSync(this.file, 'utf8'));
  }

  public() {
    const llm = this.read();
    return Object.fromEntries(Object.entries(llm).filter(([key]) => FIELDS.has(key)));
  }

  update(patch) {
    if (!patch || typeof patch !== 'object') throw new Error('invalid llm patch');
    const original = fs.readFileSync(this.file, 'utf8');
    const config = TOML.parse(original);
    config.llm = { ...(config.llm || {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (!FIELDS.has(key)) throw new Error(`unsupported llm field: ${key}`);
      if (key === 'model' && (typeof value !== 'string' || !value.trim() || value.length > 200)) throw new Error('invalid model');
      if ((key === 'temperature' || key === 'top_p') && (!Number.isFinite(value) || value < 0 || value > 2)) throw new Error(`invalid ${key}`);
      if (['max_tokens', 'request_timeout_sec', 'max_retries', 'retry_backoff_ms'].includes(key) && (!Number.isInteger(value) || value < 0 || value > 120000)) throw new Error(`invalid ${key}`);
      config.llm[key] = typeof value === 'string' ? value.trim() : value;
    }
    fs.mkdirSync(this.historyDirectory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(this.historyDirectory, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.toml`), original, { mode: 0o600 });
    atomicWrite(this.file, TOML.stringify(config));
    return this.public();
  }

  demoAccounts() {
    const accounts = this.document().matrix?.demo_accounts;
    return Array.isArray(accounts) ? accounts.map(String) : [];
  }

  addDemoAccount(username) {
    if (!/^[a-z0-9_]{1,48}$/.test(username)) throw new Error('invalid demo account');
    const original = fs.readFileSync(this.file, 'utf8');
    const config = TOML.parse(original);
    config.matrix = { ...(config.matrix || {}) };
    const accounts = new Set(Array.isArray(config.matrix.demo_accounts) ? config.matrix.demo_accounts.map(String) : []);
    accounts.add(username);
    config.matrix.demo_accounts = [...accounts].sort();
    fs.mkdirSync(this.historyDirectory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(this.historyDirectory, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.toml`), original, { mode: 0o600 });
    atomicWrite(this.file, TOML.stringify(config));
    return this.demoAccounts();
  }
}

module.exports = { LlmConfigStore };
