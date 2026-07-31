const crypto = require('node:crypto');
const http = require('node:http');

function equal(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorized(request, username, password) {
  const header = request.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  return separator !== -1 && equal(decoded.slice(0, separator), username) && equal(decoded.slice(separator + 1), password);
}

function trustedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function reply(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  response.end(body);
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65536) throw new Error('request too large');
  }
  return JSON.parse(body || '{}');
}

function page() {
  return `<!doctype html><meta charset="utf-8"><title>Klub control plane</title><style>body{font:16px system-ui;max-width:900px;margin:2rem auto}textarea,input{width:100%;box-sizing:border-box;margin:.4rem 0}textarea{min-height:14rem}button{padding:.5rem 1rem}article{border:1px solid #ccc;padding:1rem;margin:.8rem 0}</style><h1>Klub control plane</h1><p>Changes are versioned. The club bot applies them after a controlled restart.</p><section id="llm"></section><section id="personas"></section><script>
async function api(path, options={}) { const r=await fetch(path,options); if(!r.ok) throw new Error(await r.text()); return r.json(); }
function esc(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function load() { const [llm,personas,bots]=await Promise.all([api('/api/llm'),api('/api/personas'),api('/api/bots')]); document.querySelector('#llm').innerHTML='<article><h2>LLM</h2><label>Model<input id="model" value="'+esc(llm.model||'')+'"></label><label>Temperature<input id="temperature" type="number" min="0" max="2" step="0.1" value="'+(llm.temperature??'')+'"></label><label>Max tokens<input id="max_tokens" type="number" value="'+(llm.max_tokens??'')+'"></label><button onclick="saveLlm()">Save LLM</button></article>'; const options=bots.map(b=>'<option value="'+esc(b.username)+'">'+esc(b.displayName||b.username)+' ('+esc(b.userId)+')</option>').join(''); document.querySelector('#personas').innerHTML='<article><h2>New persona from BotFather account</h2><label>BotFather account<select id="new_username"><option value="">Choose an account</option>'+options+'</select></label><label>Display name<input id="new_displayname"></label><label>System prompt<textarea id="new_prompt"></textarea></label><button onclick="createPersona()">Activate persona</button></article>'+personas.map(p=>'<article><h2>'+esc(p.name)+' - '+esc(p.displayname)+'</h2><label>Display name<input id="d-'+esc(p.name)+'" value="'+esc(p.displayname)+'"></label><label>System prompt<textarea id="p-'+esc(p.name)+'">'+esc(p.character.prompt)+'</textarea></label><button onclick="savePersona(\''+p.name+'\')">Save persona</button></article>').join(''); }
async function saveLlm(){await api('/api/llm',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({model:model.value,temperature:Number(temperature.value),max_tokens:Number(max_tokens.value)})});load();}
async function savePersona(name){await api('/api/personas/'+encodeURIComponent(name),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({displayname:document.querySelector('#d-'+name).value,prompt:document.querySelector('#p-'+name).value})});load();}
async function createPersona(){await api('/api/personas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:new_username.value,displayname:new_displayname.value,prompt:new_prompt.value})});load();}
load().catch(e=>document.body.insertAdjacentHTML('beforeend','<pre>'+e.message+'</pre>'));</script>`;
}

function createAdminServer({ personaStore, llmStore = null, clubActivation = null, botRegistry = () => [], username, password }) {
  if (!personaStore || !username || !password) throw new Error('personaStore, username, and password are required');
  return http.createServer(async (request, response) => {
    try {
      if (request.url === '/health') return reply(response, 200, { service: 'klub-control-plane', status: 'ok' });
      if (!authorized(request, username, password)) {
        response.writeHead(401, { 'www-authenticate': 'Basic realm="Klub control plane"', 'cache-control': 'no-store' });
        return response.end();
      }
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !trustedOrigin(request)) return reply(response, 403, { error: 'cross-origin write denied' });
      if (request.method === 'GET' && request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" });
        return response.end(page());
      }
      if (request.method === 'GET' && request.url === '/api/personas') return reply(response, 200, personaStore.list());
      if (request.method === 'GET' && request.url === '/api/bots') {
        const bots = botRegistry().map(({ username, userId, displayName, createdAt }) => ({ username, userId, displayName, createdAt }));
        return reply(response, 200, bots);
      }
      if (request.method === 'POST' && request.url === '/api/personas') {
        if (!clubActivation) return reply(response, 409, { error: 'persona activation is not configured' });
        return reply(response, 201, clubActivation.activate(await readBody(request)));
      }
      const persona = request.url.match(/^\/api\/personas\/([a-z0-9_]{1,48})$/);
      if (request.method === 'PUT' && persona) return reply(response, 200, personaStore.update(persona[1], await readBody(request)));
      if (llmStore && request.method === 'GET' && request.url === '/api/llm') return reply(response, 200, llmStore.public());
      if (llmStore && request.method === 'PUT' && request.url === '/api/llm') return reply(response, 200, llmStore.update(await readBody(request)));
      return reply(response, 404, { error: 'not found' });
    } catch (error) {
      return reply(response, 400, { error: error.message });
    }
  });
}

module.exports = { createAdminServer };
