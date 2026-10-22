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
  return String.raw`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Клуб Дискуссий — панель управления</title><style>
:root{color-scheme:dark;--ink:#f3e9d7;--muted:#a99d8b;--gold:#f3a33c;--line:rgba(233,197,142,.15);--green:#8bc69a;--red:#e69082}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:100px}
body{margin:0;min-height:100vh;color:var(--ink);background:radial-gradient(ellipse at 50% -25%,rgba(184,116,41,.16),transparent 55%),radial-gradient(circle at 1px 1px,rgba(218,183,130,.035) 1px,transparent 0),#120f0c;background-size:auto,24px 24px,auto;font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.shell{width:min(1120px,calc(100% - 40px));margin:0 auto;padding:52px 0 84px}.admin-header{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;padding:0 0 32px;border-bottom:1px solid var(--line)}.eyebrow,.meta,.setting small{color:var(--muted)}.eyebrow{font:11px/1.4 ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
h1,h2,h3{margin-top:0;line-height:1.2}h1,h2{font-family:Georgia,"Times New Roman",serif;font-weight:500;letter-spacing:-.025em}h1{font-size:clamp(2.5rem,6vw,4rem);margin:.35rem 0 .55rem}.admin-header p:not(.eyebrow){margin:0;color:#b7ab99;font-size:16px}
.back-link{flex:0 0 auto;padding:10px 15px;border:1px solid rgba(243,163,60,.48);border-radius:999px;color:var(--ink);text-decoration:none;font-size:13px;transition:.2s}.back-link:hover{background:rgba(243,163,60,.12);border-color:var(--gold)}
.section-nav{position:sticky;top:0;z-index:10;display:flex;gap:8px;overflow-x:auto;padding:13px 0;margin:0 0 22px;background:rgba(18,15,12,.86);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}.section-nav a{flex:0 0 auto;padding:7px 13px;border:1px solid transparent;border-radius:999px;color:#b6a997;text-decoration:none;font-size:13px;transition:.2s}.section-nav a:hover{color:var(--ink);border-color:var(--line);background:rgba(255,255,255,.035)}
#overview,#gen,#moderator,#gen-personas,#llm,#bot-settings,#botfather-onboarding{scroll-margin-top:90px}section{margin:0 0 30px}article{background:linear-gradient(145deg,rgba(39,31,23,.94),rgba(26,21,17,.96));border:1px solid var(--line);border-radius:18px;padding:clamp(18px,3vw,28px);margin:14px 0;box-shadow:0 16px 48px rgba(0,0,0,.16)}article.paused{border-color:rgba(243,163,60,.38);background:linear-gradient(145deg,rgba(48,35,20,.94),rgba(27,22,17,.96))}
h2{font-size:clamp(1.55rem,3vw,2.1rem);margin-bottom:12px}h3{font-size:1.15rem;margin-bottom:12px}p{margin:.5rem 0 1rem}a{color:var(--gold)}.meta{font-size:13px}.status-ok{color:var(--green)}.status-error{color:var(--red)}.status-paused{color:var(--gold);font-weight:650}.models{columns:2;padding-left:1.2rem}.models li{break-inside:avoid;margin:.25rem 0}
.settings-grid,.overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.setting{display:flex;flex-direction:column;gap:5px}.setting small{font:11px ui-monospace,monospace}label{display:block;margin:.55rem 0;color:#e5d9c7;font-size:13px}
input:not([type=checkbox]),select,textarea{width:100%;margin:6px 0 0;padding:11px 12px;color:var(--ink);background:#15110e;border:1px solid rgba(230,197,145,.2);border-radius:10px;font:inherit;outline:none;transition:border-color .2s,box-shadow .2s}textarea{min-height:100px;resize:vertical}input:focus,select:focus,textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(243,163,60,.12)}
input[type=checkbox]{width:18px;height:18px;accent-color:var(--gold);vertical-align:middle;margin:0 9px 0 0}button{padding:10px 16px;margin:8px 8px 0 0;color:#21160b;background:linear-gradient(135deg,#ffc15c,#e99430);border:0;border-radius:999px;font:650 13px ui-sans-serif,system-ui;cursor:pointer;transition:transform .18s,filter .18s}button:hover{filter:brightness(1.08);transform:translateY(-1px)}button:focus-visible,a:focus-visible{outline:2px solid var(--gold);outline-offset:3px}.saved{color:var(--green);font-weight:650;margin-left:8px}
.quick-card{min-height:150px;display:flex;flex-direction:column;justify-content:space-between}.quick-title{font:1.45rem Georgia,serif}.quick-state{color:var(--muted);font-size:13px}.quick-link{align-self:flex-start;font-size:13px;text-decoration:none}
@media(max-width:680px){.shell{width:min(100% - 24px,1120px);padding:28px 0 56px}.admin-header{align-items:flex-start;flex-direction:column;gap:18px}.section-nav{margin-bottom:16px}.models{columns:1}}
</style><main class="shell"><header class="admin-header"><div><p class="eyebrow">КЛУБ ДИСКУССИЙ · SALON CONTROL</p><h1>Панель управления</h1><p>Дискуссия, модерация и личности — в одном месте.</p></div><a class="back-link" href="https://debate.bezrabotnyi.com/">↗ Открыть сайт дебатов</a></header><section id="gen"><article><h2>Сервис ответов</h2><p>Loading status...</p></article></section><nav class="section-nav" aria-label="Разделы админки"><a href="#overview">Обзор</a><a href="#moderator">Модерация</a><a href="#gen-personas">Личности</a><a href="#bot-settings">Дискуссия и боты</a><a href="#llm">Модель</a><a href="#botfather-onboarding">Аккаунты</a></nav><section id="overview"><article><h2>Обзор клуба</h2><p class="meta">Быстрое состояние и самые частые переключатели.</p><div class="overview-grid" id="overview-controls"><div class="quick-card"><span class="quick-title">Загрузка состояния…</span></div></div></article></section><section id="moderator"><article><p class="eyebrow">ПРАВИЛА И ТОН</p><h2>Бот-модератор</h2><p class="meta">Настройки применяются отдельно к каждой комнате.</p><div id="moderator-controls">Загрузка настроек…</div></article></section><section id="gen-personas"><article><h2>Личности клуба</h2><p>Loading identities...</p></article></section><section id="llm"></section><section id="bot-settings"></section><section id="botfather-onboarding"></section></main><script>
async function api(path, options={}) { const r=await fetch(path,options); const text=await r.text(); if(!r.ok) throw new Error(text||('HTTP '+r.status)); return text?JSON.parse(text):null; }
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function errorCard(title,error){return '<article><h2>'+esc(title)+'</h2><p class="status-error">'+esc(error.message)+'</p></article>';}
async function loadGenStatus(){try{const gen=await api('/api/gen');const health=gen.health||{};const models=(gen.models||[]).map(m=>'<li>'+esc(m.provider)+' / '+esc(m.model)+(m.available===false?' (unavailable)':'')+'</li>').join('');document.querySelector('#gen').innerHTML='<article><h2>Сервис ответов</h2><p class="'+(health.status==='ok'?'status-ok':'status-error')+'">Состояние: '+esc(health.status||'unknown')+'</p><p><strong>Адрес:</strong> '+esc(gen.endpoint)+'</p><p><strong>Текущая модель:</strong> '+esc(gen.model||'not selected')+'</p><p class="meta">Service: '+esc(health.service||'unknown')+' · Qdrant: '+esc(health.qdrant||'unknown')+' · Providers: '+esc(health.providers??'unknown')+'</p><details><summary>Доступные модели ('+(gen.models||[]).length+')</summary><ul class="models">'+models+'</ul></details></article>';}catch(e){document.querySelector('#gen').innerHTML=errorCard('Unified gen',e);}}
let genPersonas=[];
function identityFields(prefix,p={}){return '<label>Name<input id="'+prefix+'-name" value="'+esc(p.name)+'"></label><label>Gender<input id="'+prefix+'-gender" value="'+esc(p.gender||'male')+'"></label><label>Style<textarea id="'+prefix+'-style">'+esc(p.style)+'</textarea></label><label>Speaker examples (one per line)<textarea id="'+prefix+'-examples">'+esc((p.speaker_examples||[]).join('\n'))+'</textarea></label><label>Notes<textarea id="'+prefix+'-notes">'+esc(p.notes)+'</textarea></label>';}
function identityPayload(prefix){return {name:document.querySelector('#'+prefix+'-name').value,gender:document.querySelector('#'+prefix+'-gender').value,style:document.querySelector('#'+prefix+'-style').value,speaker_examples:document.querySelector('#'+prefix+'-examples').value.split('\n').map(v=>v.trim()).filter(Boolean),notes:document.querySelector('#'+prefix+'-notes').value};}
async function loadGenPersonas(){try{const loaded=await Promise.all([api('/api/gen/personas'),api('/api/gen/personas/control')]);genPersonas=loaded[0];const control=loaded[1];const global='<article class="'+(control.paused?'paused':'')+'"><h2>Личности клуба</h2><p class="'+(control.paused?'status-paused':'status-ok')+'">'+(control.paused?'All personas are paused':'Personas are active')+'</p><button onclick="setAllПриостановитьd('+(!control.paused)+')">'+(control.paused?'Возобновить всех':'Приостановить всех')+'</button></article>';const create='<article><h2>Добавить личность Matrix</h2><p class="meta">Общие настройки личности хранятся централизованно.</p><label>Matrix user or room ID<input id="gen-new-chat" placeholder="@persona:chat.example or !room:chat.example"></label>'+identityFields('gen-new')+'<button onclick="upsertGenPersona()">Сохранить личность</button></article>';const existing=genPersonas.map((p,i)=>{const effectiveПриостановитьd=control.paused||p.enabled===false;const state=p.enabled===false?'Приостановлена отдельно':(control.paused?'Приостановлена общая активность':'Активна');return '<article class="'+(effectiveПриостановитьd?'paused':'')+'"><h3>'+esc(p.chat_id)+'</h3><p class="'+(effectiveПриостановитьd?'status-paused':'status-ok')+'">'+state+' · Ответов отправлено: '+esc(p.confirmed_count??0)+'</p>'+identityFields('gen-'+i,p)+'<button onclick="toggleGenPersona('+i+')">'+(p.enabled===false?'Возобновить':'Приостановить')+'</button><button onclick="saveGenPersona('+i+')">Сохранить</button><button onclick="deleteGenPersona('+i+')">Удалить</button></article>';}).join('');document.querySelector('#gen-personas').innerHTML=global+create+existing;}catch(e){document.querySelector('#gen-personas').innerHTML=errorCard('Личности клуба',e);}}
async function upsertGenPersona(){await api('/api/gen/personas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:document.querySelector('#gen-new-chat').value,persona:identityPayload('gen-new')})});await loadGenPersonas();}
async function saveGenPersona(index){await api('/api/gen/personas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:genPersonas[index].chat_id,persona:identityPayload('gen-'+index)})});await loadGenPersonas();}
async function toggleGenPersona(index){await api('/api/gen/personas/'+encodeURIComponent(genPersonas[index].chat_id)+'/pause',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({paused:genPersonas[index].enabled!==false})});await loadGenPersonas();}
async function setAllПриостановитьd(paused){await api('/api/gen/personas/control',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({paused})});await loadGenPersonas();}
async function deleteGenPersona(index){if(!confirm('Delete Matrix identity '+genPersonas[index].chat_id+'?'))return;await api('/api/gen/personas/'+encodeURIComponent(genPersonas[index].chat_id),{method:'DELETE'});await loadGenPersonas();}
const BOT_SETTING_FIELDS = [
{s:'bot',k:'interval_min',l:'Минимальный интервал тика (мин)',min:1,max:1440,step:1},
{s:'bot',k:'interval_max',l:'Максимальный интервал тика (мин)',min:1,max:1440,step:1},
{s:'bot',k:'reply_probability',l:'Вероятность обычного ответа',min:0,max:1,step:.01},
{s:'bot',k:'active_conversation_enabled',l:'Активные беседы',bool:true},
{s:'bot',k:'active_conversation_timeout_min_sec',l:'Активна timeout min (сек)',min:1,max:86400,step:1},
{s:'bot',k:'active_conversation_timeout_max_sec',l:'Активна timeout max (сек)',min:1,max:86400,step:1},
{s:'bot',k:'active_conversation_reply_probability',l:'Вероятность active-ответа',min:0,max:1,step:.01},
{s:'bot',k:'active_conversation_poll_interval_sec',l:'Активна poll (сек)',min:1,max:3600,step:1},
{s:'bot',k:'active_conversation_max_rounds',l:'Максимум active-раундов',min:1,max:100,step:1},
{s:'bot',k:'dm_enabled',l:'Ответы в DM',bool:true},
{s:'bot',k:'dm_reply_probability',l:'Вероятность ответа в DM',min:0,max:1,step:.01},
{s:'bot',k:'dm_check_interval_min',l:'Проверка DM (мин)',min:1,max:1440,step:1},
{s:'bot',k:'dm_response_delay_min_sec',l:'DM задержка min (сек)',min:0,max:86400,step:1},
{s:'bot',k:'dm_response_delay_max_sec',l:'DM задержка max (сек)',min:0,max:86400,step:1},
{s:'bot',k:'dm_message_max_age_min',l:'Максимальный возраст DM (мин)',min:1,max:1440,step:1},
{s:'typing',k:'speed_cps',l:'Скорость печати (симв/сек)',min:.1,max:100,step:.1},
{s:'typing',k:'speed_variance',l:'Разброс скорости',min:0,max:1,step:.01},
{s:'typing',k:'min_duration_ms',l:'Минимальное время имитации набора (мс)',min:0,max:300000,step:100},
{s:'typing',k:'max_duration_ms',l:'Максимальное время имитации набора (мс)',min:0,max:300000,step:100},
{s:'typing',k:'pause_after_typing_ms',l:'Пауза после typing (мс)',min:0,max:300000,step:100},
{s:'typing',k:'pause_between_parts_min_ms',l:'Пауза частей min (мс)',min:0,max:300000,step:100},
{s:'typing',k:'pause_between_parts_max_ms',l:'Пауза частей max (мс)',min:0,max:300000,step:100},
{s:'split',k:'max_parts',l:'Максимум частей (0 = без лимита)',min:0,max:100,step:1},
{s:'split',k:'min_length_to_split',l:'Минимум символов для split',min:1,max:10000,step:1},
];
function settingsField(f,v){const id='bot-setting-'+f.s+'-'+f.k;return '<label class="setting">'+esc(f.l)+(f.bool?'<input id="'+id+'" type="checkbox" '+(v?'checked':'')+'></label>':'<input id="'+id+'" type="number" min="'+f.min+'" max="'+f.max+'" step="'+f.step+'" value="'+esc(v)+'"><small>'+f.s+'.'+f.k+'</small></label>');}
async function loadOverview(){try{const [settings,control,moderator]=await Promise.all([api('/api/bot-settings'),api('/api/gen/personas/control'),api('/api/moderator')]);const enabled=settings.bot?.active_conversation_enabled===true;const active=(moderator.rooms||[]).filter(room=>room.active).length;document.querySelector('#overview-controls').innerHTML='<article class="quick-card"><div><p class="eyebrow">ДИСКУССИЯ</p><div class="quick-title">'+(enabled?'Продолжается':'На паузе')+'</div><p class="quick-state">Автоматические многоходовые ответы ботов</p></div><label><input type="checkbox" '+(enabled?'checked':'')+' onchange="saveOverviewDiscussion(this.checked)"> Идёт дискуссия</label></article><article class="quick-card"><div><p class="eyebrow">ЛИЧНОСТИ</p><div class="quick-title">'+(control.paused?'На паузе':'Активны')+'</div><p class="quick-state">Matrix-персонажи клуба</p></div><label><input type="checkbox" '+(control.paused?'checked':'')+' onchange="saveOverviewПриостановить(this.checked)"> Пауза для всех</label></article><article class="quick-card"><div><p class="eyebrow">МОДЕРАЦИЯ</p><div class="quick-title">'+active+' из '+(moderator.rooms||[]).length+' комнат</div><p class="quick-state">'+(active?'Модератор включён':'Модерация сейчас выключена')+'</p></div><a class="quick-link" href="#moderator">Настроить комнаты →</a></article>';}catch(e){document.querySelector('#overview-controls').innerHTML=errorCard('Обзор клуба',e);}}
async function saveOverviewDiscussion(enabled){try{await api('/api/bot-settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({bot:{active_conversation_enabled:enabled}})});await loadOverview();await loadBotSettings();}catch(e){alert(e.message);await loadOverview();}}
async function saveOverviewПриостановить(paused){try{await api('/api/gen/personas/control',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({paused})});await loadOverview();await loadGenPersonas();}catch(e){alert(e.message);await loadOverview();}}
let moderatorData=null;
async function loadModerator(){try{moderatorData=await api('/api/moderator');const rules=moderatorData.rules||[];const rooms=moderatorData.rooms||[];const roomHtml=rooms.map((r,i)=>'<article class="'+(r.active?'':'paused')+'"><h3>'+esc(r.roomId)+'</h3><label><input type="checkbox" id="mod-active-'+i+'" '+(r.active?'checked':'')+'> Модерация включена</label><label>Режим<select id="mod-preset-'+i+'" onchange="applyModeratorPreset('+i+')">'+moderatorData.presets.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===r.preset?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><label>Строгость (1–5)<input id="mod-strict-'+i+'" type="number" min="1" max="5" value="'+esc(r.strictness)+'"></label><div class="settings-grid">'+rules.map(rule=>'<label><input type="checkbox" id="mod-rule-'+i+'-'+esc(rule.id)+'" '+(r.enabledRules.includes(rule.id)?'checked':'')+'>'+esc(rule.name)+'<small>'+esc(rule.description)+'</small></label>').join('')+'</div><label>Стиль ответа<input id="mod-style-'+i+'" value="'+esc(r.responseStyle)+'"></label><label>Замечаний до подсказки<input id="mod-warnings-'+i+'" type="number" min="1" max="100" value="'+esc(r.maxWarningsBeforeNote)+'"></label><label>Интервал авто-замечаний, сек<input id="mod-interval-'+i+'" type="number" min="1" max="86400" value="'+esc(r.autoWarnInterval)+'"></label><label>Тон<textarea id="mod-tone-'+i+'">'+esc(r.tone)+'</textarea></label><label>Тема<textarea id="mod-topic-'+i+'">'+esc(r.topic)+'</textarea></label><button onclick="saveModeratorRoom('+i+')">Сохранить модерацию</button></article>').join('');document.querySelector('#moderator-controls').innerHTML='<article><h3>Добавить комнату Matrix</h3><label>ID комнаты<input id="mod-new-room" placeholder="!room:chat.example"></label><button onclick="createModeratorRoom()">Добавить выключенной</button></article>'+roomHtml;}catch(e){document.querySelector('#moderator').innerHTML=errorCard('Бот-модератор',e);}}
async function createModeratorRoom(){try{await api('/api/moderator/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId:document.querySelector('#mod-new-room').value})});await loadModerator();}catch(e){alert(e.message);}}
async function applyModeratorPreset(i){const preset=document.querySelector('#mod-preset-'+i).value;try{await api('/api/moderator/rooms/'+encodeURIComponent(moderatorData.rooms[i].roomId),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({preset})});await loadModerator();}catch(e){alert(e.message);}}
async function saveModeratorRoom(i){const patch={active:document.querySelector('#mod-active-'+i).checked,preset:document.querySelector('#mod-preset-'+i).value,strictness:Number(document.querySelector('#mod-strict-'+i).value),enabledRules:(moderatorData.rules||[]).filter(rule=>document.querySelector('#mod-rule-'+i+'-'+rule.id).checked).map(rule=>rule.id),responseStyle:document.querySelector('#mod-style-'+i).value,maxWarningsBeforeNote:Number(document.querySelector('#mod-warnings-'+i).value),autoWarnInterval:Number(document.querySelector('#mod-interval-'+i).value),tone:document.querySelector('#mod-tone-'+i).value,discussionTopic:document.querySelector('#mod-topic-'+i).value};try{await api('/api/moderator/rooms/'+encodeURIComponent(moderatorData.rooms[i].roomId),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});await loadModerator();}catch(e){alert(e.message);}}
async function loadBotSettings(){try{const settings=await api('/api/bot-settings');document.querySelector('#bot-settings').innerHTML='<article><h2>Поведение Matrix</h2><p class="meta">Изменения применяются перед следующим тиком бота. Вероятности задаются от 0 до 1.</p><div class="settings-grid">'+BOT_SETTING_FIELDS.map(f=>settingsField(f,settings[f.s][f.k])).join('')+'</div><button onclick="saveBotSettings()">Сохранить поведение</button><span id="bot-settings-saved" class="saved"></span></article>';}catch(e){document.querySelector('#bot-settings').innerHTML=errorCard('Поведение Matrix',e);}}
async function saveBotSettings(){const patch={bot:{},typing:{},split:{}};for(const f of BOT_SETTING_FIELDS){const el=document.querySelector('#bot-setting-'+f.s+'-'+f.k);patch[f.s][f.k]=f.bool?el.checked:Number(el.value);}try{await api('/api/bot-settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});document.querySelector('#bot-settings-saved').textContent='Сохранено';}catch(e){alert(e.message);}}
async function loadLocal(){try{const [llm,bots]=await Promise.all([api('/api/llm'),api('/api/bots')]);document.querySelector('#llm').innerHTML='<article><h2>LLM</h2><label>Модель<input id="model" value="'+esc(llm.model||'')+'"></label><label>Температура<input id="temperature" type="number" min="0" max="2" step="0.1" value="'+(llm.temperature??'')+'"></label><label>Максимум токенов<input id="max_tokens" type="number" value="'+(llm.max_tokens??'')+'"></label><button onclick="saveLlm()">Сохранить модель</button></article>';const options=bots.map(b=>'<option value="'+esc(b.username)+'">'+esc(b.displayName||b.username)+' ('+esc(b.userId)+')</option>').join('');document.querySelector('#botfather-onboarding').innerHTML='<article><h2>Добавить личность из BotFather</h2><p class="meta">Текущие настройки доступны в разделе «Личности клуба».</p><label>Аккаунт BotFather<select id="new_username"><option value="">Выберите аккаунт</option>'+options+'</select></label><label>Имя<input id="new_displayname"></label><label>Инструкция для модели<textarea id="new_prompt"></textarea></label><button onclick="createPersona()">Создать личность</button></article>';}catch(e){document.querySelector('#llm').innerHTML=errorCard('LLM',e);document.querySelector('#botfather-onboarding').innerHTML=errorCard('BotFather onboarding',e);}}
async function saveLlm(){await api('/api/llm',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({model:model.value,temperature:Number(temperature.value),max_tokens:Number(max_tokens.value)})});await loadLocal();await loadGenStatus();}
async function createPersona(){await api('/api/personas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:new_username.value,displayname:new_displayname.value,prompt:new_prompt.value})});await loadLocal();}
Promise.allSettled([loadGenStatus(),loadGenPersonas(),loadLocal(),loadBotSettings(),loadModerator(),loadOverview()]);</script>`;
}

function createAdminServer({ personaStore, llmStore = null, botSettingsStore = null, clubActivation = null, botRegistry = () => [], orchestratorClient = null, moderatorClient = null }) {
  if (!personaStore) throw new Error('personaStore is required');
  return http.createServer(async (request, response) => {
    try {
      if (request.url === '/health') return reply(response, 200, { service: 'klub-control-plane', status: 'ok' });
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !trustedOrigin(request)) return reply(response, 403, { error: 'cross-origin write denied' });
      if (botSettingsStore && request.method === 'GET' && request.url === '/api/bot-settings') return reply(response, 200, botSettingsStore.public());
      if (botSettingsStore && request.method === 'PUT' && request.url === '/api/bot-settings') return reply(response, 200, botSettingsStore.update(await readBody(request)));
      if (moderatorClient && request.method === 'GET' && request.url === '/api/moderator') return reply(response, 200, await moderatorClient.list());
      if (moderatorClient && request.method === 'POST' && request.url === '/api/moderator/rooms') { const body = await readBody(request); if (typeof body.roomId !== 'string') return reply(response, 400, { error: 'roomId is required' }); return reply(response, 201, await moderatorClient.create(body.roomId)); }
      const moderatorRoom = request.url.match(/^\/api\/moderator\/rooms\/(.+)$/);
      if (moderatorClient && request.method === 'PUT' && moderatorRoom) return reply(response, 200, await moderatorClient.update(decodeURIComponent(moderatorRoom[1]), await readBody(request)));
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
        return reply(response, 200, await orchestratorClient.getMatrixПриостановить());
      }
      if (request.method === 'PUT' && request.url === '/api/gen/personas/control') {
        if (!orchestratorClient) return reply(response, 409, { error: 'comment orchestrator is not configured' });
        const body = await readBody(request);
        return reply(response, 200, await orchestratorClient.setMatrixПриостановить(Boolean(body.paused)));
      }
      const genPersonaПриостановить = request.url.match(/^\/api\/gen\/personas\/(.+)\/pause$/);
      if (request.method === 'PUT' && genPersonaПриостановить) {
        if (!orchestratorClient) return reply(response, 409, { error: 'comment orchestrator is not configured' });
        const body = await readBody(request);
        return reply(response, 200, await orchestratorClient.setMatrixPersonaПриостановить(decodeURIComponent(genPersonaПриостановить[1]), Boolean(body.paused)));
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
