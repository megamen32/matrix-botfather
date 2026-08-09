const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const TOML = require('@iarna/toml');

const DEFAULTS = {
  bot: {
    interval_min: 20, interval_max: 40, reply_probability: 0.6,
    active_conversation_enabled: true, active_conversation_timeout_min_sec: 60,
    active_conversation_timeout_max_sec: 120, active_conversation_reply_probability: 0.95,
    active_conversation_poll_interval_sec: 5, active_conversation_max_rounds: 10,
    dm_enabled: true, dm_reply_probability: 0.95, dm_check_interval_min: 2,
    dm_response_delay_min_sec: 10, dm_response_delay_max_sec: 60, dm_message_max_age_min: 10,
  },
  typing: {
    speed_cps: 5, speed_variance: 0.2, min_duration_ms: 1500, max_duration_ms: 30000,
    pause_after_typing_ms: 300, pause_between_parts_min_ms: 1000, pause_between_parts_max_ms: 4000,
  },
  split: { max_parts: 0, min_length_to_split: 120 },
};

const LIMITS = {
  interval_min: [1, 1440], interval_max: [1, 1440],
  reply_probability: [0, 1], active_conversation_reply_probability: [0, 1], dm_reply_probability: [0, 1],
  active_conversation_timeout_min_sec: [1, 86400], active_conversation_timeout_max_sec: [1, 86400],
  active_conversation_poll_interval_sec: [1, 3600], active_conversation_max_rounds: [1, 100],
  dm_check_interval_min: [1, 1440], dm_response_delay_min_sec: [0, 86400], dm_response_delay_max_sec: [0, 86400], dm_message_max_age_min: [1, 1440],
  speed_cps: [0.1, 100], speed_variance: [0, 1], min_duration_ms: [0, 300000], max_duration_ms: [0, 300000],
  pause_after_typing_ms: [0, 300000], pause_between_parts_min_ms: [0, 300000], pause_between_parts_max_ms: [0, 300000],
  max_parts: [0, 100], min_length_to_split: [1, 10000],
};

const FIELDS = Object.fromEntries(Object.keys(DEFAULTS).map((section) => [section, new Set(Object.keys(DEFAULTS[section]))]));

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, value, { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function validateValue(key, value) {
  if (key.endsWith('_enabled')) {
    if (typeof value !== 'boolean') throw new Error(`invalid ${key}`);
    return;
  }
  const limit = LIMITS[key];
  if (!limit || typeof value !== 'number' || !Number.isFinite(value) || value < limit[0] || value > limit[1]) throw new Error(`invalid ${key}`);
  if (Number.isInteger(DEFAULTS.bot[key]) || Number.isInteger(DEFAULTS.typing[key]) || Number.isInteger(DEFAULTS.split[key])) {
    if (!Number.isInteger(value)) throw new Error(`invalid ${key}`);
  }
}

class BotSettingsStore {
  constructor(file, historyDirectory) {
    this.file = file;
    this.historyDirectory = historyDirectory;
  }

  document() { return TOML.parse(fs.readFileSync(this.file, 'utf8')); }

  public() {
    const document = this.document();
    const result = cloneDefaults();
    for (const section of Object.keys(DEFAULTS)) Object.assign(result[section], document[section] || {});
    return result;
  }

  update(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('invalid Matrix bot settings patch');
    const original = fs.readFileSync(this.file, 'utf8');
    const config = TOML.parse(original);
    const next = this.public();
    for (const [section, values] of Object.entries(patch)) {
      if (!FIELDS[section] || !values || typeof values !== 'object' || Array.isArray(values)) throw new Error(`unsupported Matrix bot settings section: ${section}`);
      for (const [key, value] of Object.entries(values)) {
        if (!FIELDS[section].has(key)) throw new Error(`unsupported Matrix bot field: ${key}`);
        validateValue(key, value);
        next[section][key] = value;
      }
    }
    if (next.bot.interval_min > next.bot.interval_max) throw new Error('interval_min must not exceed interval_max');
    if (next.bot.active_conversation_timeout_min_sec > next.bot.active_conversation_timeout_max_sec) throw new Error('active conversation timeout minimum must not exceed maximum');
    if (next.bot.dm_response_delay_min_sec > next.bot.dm_response_delay_max_sec) throw new Error('DM delay minimum must not exceed maximum');
    if (next.typing.min_duration_ms > next.typing.max_duration_ms) throw new Error('typing duration minimum must not exceed maximum');
    if (next.typing.pause_between_parts_min_ms > next.typing.pause_between_parts_max_ms) throw new Error('part pause minimum must not exceed maximum');
    config.bot = { ...(config.bot || {}), ...next.bot };
    config.typing = { ...(config.typing || {}), ...next.typing };
    config.split = { ...(config.split || {}), ...next.split };
    fs.mkdirSync(this.historyDirectory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(this.historyDirectory, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.toml`), original, { mode: 0o600 });
    atomicWrite(this.file, TOML.stringify(config));
    return this.public();
  }
}

module.exports = { BotSettingsStore, DEFAULTS };
