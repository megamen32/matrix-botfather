const http = require('node:http');

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

function noContent(response) {
  response.writeHead(204, { 'cache-control': 'no-store' });
  response.end();
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
  return String.raw`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Klub control plane</title><style>body{font:16px system-ui;max-width:980px;margin:2rem auto;padding:0 1rem;color:#172033;background:#f5f7fb}textarea,input,select{width:100%;box-sizing:border-box;margin:.35rem 0 .75rem;padding:.5rem}textarea{min-height:8rem}button{padding:.55rem 1rem;margin:.25rem .35rem .25rem 0}article{background:#fff;border:1px solid #ccd3df;border-radius:.55rem;padding:1rem;margin:.8rem 0;box-shadow:0 1px 3px #0001}article.paused{border-color:#c8861a;background:#fffaf0}.status-ok{color:#16733b}.status-error{color:#a12727}.status-paused{color:#9a5d00;font-weight:600}.meta{color:#536176}.models{columns:2;padding-left:1.2rem}@media(max-width:700px){.models{columns:1}}</style><h1>Klub control plane</h1><p>Changes are versioned. Runtime persona state is owned by unified gen.</p><section id="gen"><article><h2>Unified gen</h2><p>Loading status...</p></article></section><section id="gen-personas"><article><h2>Matrix persona identities</h2><p>Loading identities...</p></article></section><section id="llm"></section><section id="botfather-onboarding"></section><script>
async function api(path, options={}) { const r=await fetch(path,options); const text=await r.text(); if(!r.ok) throw new Error(text||('HTTP '+r.status)); return text?JSON.parse(text):null; }
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function errorCard(title,error){return '<article><h2>'+esc(title)+'</h2><p class="status-error">'+esc(error.message)+'</p></article>';}
async function loadGenStatus(){try{const gen=await api('/api/gen');const health=gen.health||{};const models=(gen.models||[]).map(m=>'<li>'+esc(m.provider)+' / '+esc(m.model)+(m.available===false?' (unavailable)':'')+'</li>').join('');document.querySelector('#gen').innerHTML='<article><h2>Unified gen</h2><p class="'+(health.status==='ok'?'status-ok':'status-error')+'">Health: '+esc(health.status||'unknown')+'</p><p><strong>Endpoint:</strong> '+esc(gen.endpoint)+'</p><p><strong>Current Matrix model:</strong> '+esc(gen.model||'not selected')+'</p><p class="meta">Service: '+esc(health.service||'unknown')+' · Qdrant: '+esc(health.qdrant||'unknown')+' · Providers: '+esc(health.providers??'unknown')+'</p><details><summary>Available models ('+(gen.models||[]).length+')</summary><ul class="models">'+models+'</ul></details></article>';}catch(e){document.querySelector('#gen').innerHTML=errorCard('Unified gen',e);}}
let genPersonas=[];
function identityFields(prefix,p={}){return '<label>Name<input id="'+prefix+'-name" value="'+esc(p.name)+'"></label><label>Gender<input id="'+prefix+'-gender" value="'+esc(p.gender||'male')+'"></label><label>Style<textarea id="'+prefix+'-style">'+esc(p.style)+'</textarea></label><label>Speaker examples (one per line)<textarea id="'+prefix+'-examples">'+esc((p.speaker_examples||[]).join('\n'))+'</textarea></label><label>Notes<textarea id="'+prefix+'-notes">'+esc(p.notes)+'</textarea></label>';}
function identityPayload(prefix){return {name:document.querySelector('#'+prefix+'-name').value,gender:document.querySelector('#'+prefix+'-gender').value,style:document.querySelector('#'+prefix+'-style').value,speaker_examples:document.querySelector('#'+prefix+'-examples').value.split('\n').map(v=>v.trim()).filter(Boolean),notes:document.querySelector('#'+prefix+'-notes').value};}
async function loadGenPersonas(){try{const loaded=await Promise.all([api('/api/gen/personas'),api('/api/gen/personas/control')]);genPersonas=loaded[0];const control=loaded[1];const global='<article class="'+(control.paused?'paused':'')+'"><h2>Matrix persona identities</h2><p class="'+(control.paused?'status-paused':'status-ok')+'">'+(control.paused?'All personas are paused':'Personas are active')+'</p><button onclick="setAllPaused('+(!control.paused)+')">'+(control.paused?'Resume all':'Pause all')+'</button></article>';const create='<article><h2>Create Matrix identity</h2><p class="meta">The unified gen store is the single source of persona settings.</p><label>Matrix user or room ID<input id="gen-new-chat" placeholder="@persona:chat.example or !room:chat.example"></label>'+identityFields('gen-new')+'<button onclick="upsertGenPersona()">Create or replace identity</button></article>';const existing=genPersonas.map((p,i)=>{const effectivePaused=control.paused||p.enabled===false;const state=p.enabled===false?'Paused individually':(control.paused?'Paused globally':'Active');return '<article class="'+(effectivePaused?'paused':'')+'"><h3>'+esc(p.chat_id)+'</h3><p class="'+(effectivePaused?'status-paused':'status-ok')+'">'+state+' · Confirmed replies: '+esc(p.confirmed_count??0)+'</p>'+identityFields('gen-'+i,p)+'<button onclick="toggleGenPersona('+i+')">'+(p.enabled===false?'Resume':'Pause')+'</button><button onclick="saveGenPersona('+i+')">Save identity</button><button onclick="deleteGenPersona('+i+')">Delete identity</button></article>';}).join('');document.querySelector('#gen-personas').innerHTML=global+create+existing;}catch(e){document.querySelector('#gen-personas').innerHTML=errorCard('Matrix persona identities',e);}}
async function upsertGenPersona(){await api('/api/gen/personas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:document.querySelector('#gen-new-chat').value,persona:identityPayload('gen-new')})});await loadGenPersonas();}
async function saveGenPersona(index){await api('/api/gen/personas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:genPersonas[index].chat_id,persona:identityPayload('gen-'+index)})});await loadGenPersonas();}
async function toggleGenPersona(index){await api('/api/gen/personas/'+encodeURIComponent(genPersonas[index].chat_id)+'/pause',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({paused:genPersonas[index].enabled!==false})});await loadGenPersonas();}
async function setAllPaused(paused){await api('/api/gen/personas/control',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({paused})});await loadGenPersonas();}
async function deleteGenPersona(index){if(!confirm('Delete Matrix identity '+genPersonas[index].chat_id+'?'))return;await api('/api/gen/personas/'+encodeURIComponent(genPersonas[index].chat_id),{method:'DELETE'});await loadGenPersonas();}
async function loadLocal(){try{const [llm,bots]=await Promise.all([api('/api/llm'),api('/api/bots')]);document.querySelector('#llm').innerHTML='<article><h2>LLM</h2><label>Model<input id="model" value="'+esc(llm.model||'')+'"></label><label>Temperature<input id="temperature" type="number" min="0" max="2" step="0.1" value="'+(llm.temperature??'')+'"></label><label>Max tokens<input id="max_tokens" type="number" value="'+(llm.max_tokens??'')+'"></label><button onclick="saveLlm()">Save LLM</button></article>';const options=bots.map(b=>'<option value="'+esc(b.username)+'">'+esc(b.displayName||b.username)+' ('+esc(b.userId)+')</option>').join('');document.querySelector('#botfather-onboarding').innerHTML='<article><h2>Create identity from BotFather account</h2><p class="meta">Existing settings are shown only in unified gen above.</p><label>BotFather account<select id="new_username"><option value="">Choose an account</option>'+options+'</select></label><label>Display name<input id="new_displayname"></label><label>System prompt<textarea id="new_prompt"></textarea></label><button onclick="createPersona()">Activate persona</button></article>';}catch(e){document.querySelector('#llm').innerHTML=errorCard('LLM',e);document.querySelector('#botfather-onboarding').innerHTML=errorCard('BotFather onboarding',e);}}
async function saveLlm(){await api('/api/llm',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({model:model.value,temperature:Number(temperature.value),max_tokens:Number(max_tokens.value)})});await loadLocal();await loadGenStatus();}
async function createPersona(){await api('/api/personas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:new_username.value,displayname:new_displayname.value,prompt:new_prompt.value})});await loadLocal();}
Promise.allSettled([loadGenStatus(),loadGenPersonas(),loadLocal()]);</script>`;
}

function createAdminServer({ personaStore, llmStore = null, clubActivation = null, botRegistry = () => [], orchestratorClient = null }) {
  if (!personaStore) throw new Error('personaStore is required');
  return http.createServer(async (request, response) => {
    try {
      if (request.url === '/health') return reply(response, 200, { service: 'klub-control-plane', status: 'ok' });
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !trustedOrigin(request)) return reply(response, 403, { error: 'cross-origin write denied' });
      if (request.method === 'GET' && request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" });
        return response.end(page());
      }
      if (request.method === 'GET' && request.url === '/api/gen') {
        if (!orchestratorClient) return reply(response, 409, { error: 'comment orchestrator is not configured' });
        const model = llmStore ? llmStore.public().model : null;
        return reply(response, 200, await orchestratorClient.status(model));
      }
      if (request.method === 'GET' && request.url === '/api/gen/personas') {
        if (!orchestratorClient) return reply(response, 409, { error: 'comment orchestrator is not configured' });
        return reply(response, 200, await orchestratorClient.listMatrixPersonas());
      }
      if (request.method === 'POST' && request.url === '/api/gen/personas') {
        if (!orchestratorClient) return reply(response, 409, { error: 'comment orchestrator is not configured' });
        return reply(response, 201, await orchestratorClient.upsertMatrixPersona(await readBody(request)));
      }
      if (request.method === 'GET' && request.url === '/api/gen/personas/control') {
        if (!orchestratorClient) return reply(response, 409, { error: 'comment orchestrator is not configured' });
        return reply(response, 200, await orchestratorClient.getMatrixPause());
      }
      if (request.method === 'PUT' && request.url === '/api/gen/personas/control') {
        if (!orchestratorClient) return reply(response, 409, { error: 'comment orchestrator is not configured' });
        const body = await readBody(request);
        return reply(response, 200, await orchestratorClient.setMatrixPause(Boolean(body.paused)));
      }
      const genPersonaPause = request.url.match(/^\/api\/gen\/personas\/(.+)\/pause$/);
      if (request.method === 'PUT' && genPersonaPause) {
        if (!orchestratorClient) return reply(response, 409, { error: 'comment orchestrator is not configured' });
        const body = await readBody(request);
        return reply(response, 200, await orchestratorClient.setMatrixPersonaPause(decodeURIComponent(genPersonaPause[1]), Boolean(body.paused)));
      }
      const genPersona = request.url.match(/^\/api\/gen\/personas\/(.+)$/);
      if (request.method === 'DELETE' && genPersona) {
        if (!orchestratorClient) return reply(response, 409, { error: 'comment orchestrator is not configured' });
        await orchestratorClient.deleteMatrixPersona(decodeURIComponent(genPersona[1]));
        return noContent(response);
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
      return reply(response, error.statusCode || 400, { error: error.message });
    }
  });
}

module.exports = { createAdminServer };
