const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const TOML = require('@iarna/toml');

const NAME = /^[a-z0-9_]{1,48}$/;
const STYLE_FIELDS = new Set(['sentences_per_part', 'typing_speed_cps', 'split_by_paragraph', 'max_parts']);

function assertName(name) {
  if (!NAME.test(name)) throw new Error('invalid persona name');
}

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, value, { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

class PersonaStore {
  constructor(personaDirectory, historyDirectory) {
    this.personaDirectory = personaDirectory;
    this.historyDirectory = historyDirectory;
  }

  file(name) {
    assertName(name);
    return path.join(this.personaDirectory, `${name}.toml`);
  }

  get(name) {
    return TOML.parse(fs.readFileSync(this.file(name), 'utf8'));
  }

  list() {
    return fs.readdirSync(this.personaDirectory)
      .filter((entry) => entry.endsWith('.toml'))
      .map((entry) => entry.slice(0, -5))
      .filter((name) => NAME.test(name))
      .sort()
      .map((name) => ({ name, ...this.get(name) }));
  }

  create(name, { displayname, prompt, style = {} }) {
    assertName(name);
    const file = this.file(name);
    if (fs.existsSync(file)) throw new Error('persona already exists');
    if (typeof displayname !== 'string' || !displayname.trim() || displayname.length > 120) throw new Error('invalid displayname');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000) throw new Error('invalid prompt');
    const persona = {
      username: name,
      displayname: displayname.trim(),
      character: { prompt: prompt.trim() },
      style: { sentences_per_part: 2, typing_speed_cps: 8, ...style },
    };
    atomicWrite(file, TOML.stringify(persona));
    return persona;
  }

  update(name, patch) {
    const file = this.file(name);
    const previous = fs.readFileSync(file, 'utf8');
    const next = this.get(name);
    if (patch.displayname !== undefined) {
      if (typeof patch.displayname !== 'string' || !patch.displayname.trim() || patch.displayname.length > 120) throw new Error('invalid displayname');
      next.displayname = patch.displayname.trim();
    }
    if (patch.prompt !== undefined) {
      if (typeof patch.prompt !== 'string' || !patch.prompt.trim() || patch.prompt.length > 16000) throw new Error('invalid prompt');
      next.character = { ...(next.character || {}), prompt: patch.prompt.trim() };
    }
    if (patch.style !== undefined) {
      if (!patch.style || typeof patch.style !== 'object') throw new Error('invalid style');
      next.style = { ...(next.style || {}) };
      for (const [field, value] of Object.entries(patch.style)) {
        if (!STYLE_FIELDS.has(field)) throw new Error(`unsupported style field: ${field}`);
        if (field === 'split_by_paragraph' && typeof value !== 'boolean') throw new Error('invalid split_by_paragraph');
        if (field === 'max_parts' && value !== null && (!Number.isInteger(value) || value < 1 || value > 20)) throw new Error('invalid max_parts');
        if ((field === 'sentences_per_part' || field === 'typing_speed_cps') && (!Number.isFinite(value) || value <= 0 || value > 100)) throw new Error(`invalid ${field}`);
        next.style[field] = value;
      }
    }
    fs.mkdirSync(path.join(this.historyDirectory, name), { recursive: true, mode: 0o700 });
    const revision = path.join(this.historyDirectory, name, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.toml`);
    fs.writeFileSync(revision, previous, { mode: 0o600 });
    atomicWrite(file, TOML.stringify(next));
    return next;
  }
}

module.exports = { PersonaStore };
