const fs = require('node:fs');

function tokenKey(username) {
  if (!/^[a-z0-9_]{1,48}$/.test(username)) throw new Error('invalid persona username');
  return `MATRIX_TOKEN_${username.toUpperCase()}`;
}

function readEnv(file) {
  if (!fs.existsSync(file)) return new Map();
  return new Map(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).filter((line) => !line.startsWith('#')).map((line) => {
    const separator = line.indexOf('=');
    return separator === -1 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function writeEnv(file, values) {
  const rendered = [...values.entries()].map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  writeAtomic(file, rendered, 0o600);
}

function writeAtomic(file, contents, mode) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents, { mode });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, mode);
}

class ClubActivation {
  constructor({ personaStore, llmStore, runtimeEnvFile, tokenFor, managedBot }) {
    this.personaStore = personaStore;
    this.llmStore = llmStore;
    this.runtimeEnvFile = runtimeEnvFile;
    this.tokenFor = tokenFor;
    this.managedBot = managedBot;
  }

  activate({ username, displayname, prompt, style }) {
    if (!this.managedBot(username)) throw new Error('BotFather account is not registered');
    const token = this.tokenFor(username);
    if (!token) throw new Error('BotFather token is unavailable');
    const configBefore = fs.readFileSync(this.llmStore.file, 'utf8');
    const envBefore = fs.existsSync(this.runtimeEnvFile) ? fs.readFileSync(this.runtimeEnvFile, 'utf8') : null;
    let created = false;
    try {
      const persona = this.personaStore.create(username, { displayname, prompt, style });
      created = true;
      this.llmStore.addDemoAccount(username);
      const env = readEnv(this.runtimeEnvFile);
      env.set(tokenKey(username), token);
      writeEnv(this.runtimeEnvFile, env);
      return persona;
    } catch (error) {
      writeAtomic(this.llmStore.file, configBefore, 0o644);
      if (envBefore === null) fs.rmSync(this.runtimeEnvFile, { force: true });
      else writeAtomic(this.runtimeEnvFile, envBefore, 0o600);
      if (created) fs.rmSync(this.personaStore.file(username), { force: true });
      throw error;
    }
  }
}

module.exports = { ClubActivation, tokenKey };
