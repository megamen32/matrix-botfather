const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class SecretVault {
  constructor(file, base64Key) {
    this.file = file;
    this.key = Buffer.from(base64Key || '', 'base64');
    if (this.key.length !== 32) throw new Error('CONTROL_PLANE_MASTER_KEY must be a base64-encoded 32-byte key');
  }

  load() {
    if (!fs.existsSync(this.file)) return {};
    const envelope = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  }

  save(data) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(data));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(temporary, envelope, { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    fs.chmodSync(this.file, 0o600);
  }

  get(key) {
    return this.load()[key] || null;
  }

  put(key, value) {
    const data = this.load();
    data[key] = value;
    this.save(data);
  }

  delete(key) {
    const data = this.load();
    if (!(key in data)) return false;
    delete data[key];
    this.save(data);
    return true;
  }
}

module.exports = { SecretVault };
