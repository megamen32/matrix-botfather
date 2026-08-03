const DEFAULT_ENDPOINT = 'https://gen.bezrabotnyi.com';

function normalizeEndpoint(value) {
  const url = new URL(value || DEFAULT_ENDPOINT);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('comment orchestrator endpoint must use HTTP(S)');
  return url.href.replace(/\/$/, '');
}

function upstreamError(message) {
  const error = new Error(message);
  error.statusCode = 502;
  return error;
}

class OrchestratorClient {
  constructor({ endpoint = process.env.COMMENT_ORCHESTRATOR_URL || DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
    this.endpoint = normalizeEndpoint(endpoint);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(`${this.endpoint}${path}`, {
        method,
        headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw upstreamError(`comment orchestrator ${method} ${path} is unreachable`);
    } finally {
      clearTimeout(timeout);
    }
    const text = response.status === 204 ? '' : await response.text();
    if (!response.ok) throw upstreamError(`comment orchestrator ${method} ${path} failed (${response.status})`);
    return text ? JSON.parse(text) : null;
  }

  async status(model = null) {
    const [health, models] = await Promise.all([
      this.request('/healthz'),
      this.request('/api/v1/models'),
    ]);
    return { endpoint: this.endpoint, model, health, models };
  }

  listMatrixPersonas() {
    return this.request('/api/v1/personas?source=matrix&limit=500');
  }

  getMatrixPause() {
    return this.request('/api/v1/personas/control/matrix');
  }

  setMatrixPause(paused) {
    return this.request('/api/v1/personas/control/matrix', {
      method: 'PUT',
      body: { paused: Boolean(paused) },
    });
  }

  setMatrixPersonaPause(chatId, paused) {
    if (typeof chatId !== 'string' || !chatId.trim()) throw new Error('chat_id is required');
    return this.request(`/api/v1/personas/matrix/${encodeURIComponent(chatId.trim())}/pause`, {
      method: 'PUT',
      body: { paused: Boolean(paused) },
    });
  }

  upsertMatrixPersona({ chat_id, persona }) {
    if (typeof chat_id !== 'string' || !chat_id.trim()) throw new Error('chat_id is required');
    if (!persona || typeof persona !== 'object' || Array.isArray(persona)) throw new Error('persona is required');
    return this.request('/api/v1/personas', {
      method: 'POST',
      body: { source: 'matrix', chat_id: chat_id.trim(), persona },
    });
  }

  deleteMatrixPersona(chatId) {
    if (typeof chatId !== 'string' || !chatId.trim()) throw new Error('chat_id is required');
    return this.request(`/api/v1/personas/matrix/${encodeURIComponent(chatId.trim())}`, { method: 'DELETE' });
  }
}

module.exports = { DEFAULT_ENDPOINT, OrchestratorClient };
