class ModeratorClient {
  constructor(base = process.env.MODERATOR_CONTROL_URL || 'http://127.0.0.1:8093') { this.base = base; }
  async request(path, method = 'GET', body) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 3000);
    try { const response = await fetch(this.base + path, { method, signal: controller.signal, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const value = await response.json(); if (!response.ok) throw new Error(value.error || 'moderator API HTTP ' + response.status); return value; }
    catch (error) { throw new Error(error.name === 'AbortError' ? 'moderator API timed out' : 'moderator API unavailable: ' + error.message); }
    finally { clearTimeout(timer); }
  }
  list() { return this.request('/rooms'); }
  create(roomId) { return this.request('/rooms/' + encodeURIComponent(roomId), 'POST'); }
  update(roomId, patch) { return this.request('/rooms/' + encodeURIComponent(roomId), 'PUT', patch); }
}
module.exports = { ModeratorClient };
