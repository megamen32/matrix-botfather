const crypto = require('node:crypto');

function eventMessage(result) {
  if (typeof result === 'string') return { msgtype: 'm.text', body: result };
  if (result && result.format && result.html) return { msgtype: 'm.text', body: result.body, format: result.format, formatted_body: result.html };
  throw new Error('unsupported Matrix response');
}

function timelineMessages(sync, ownUserId) {
  const messages = [];
  for (const [roomId, room] of Object.entries(sync?.rooms?.join || {})) {
    for (const event of room?.timeline?.events || []) {
      if (event.type === 'm.room.message' && event.sender !== ownUserId && event.content?.msgtype === 'm.text' && typeof event.content.body === 'string') {
        messages.push({ roomId, sender: event.sender, body: event.content.body });
      }
    }
  }
  return messages;
}

async function request(homeserver, token, method, path, body) {
  const response = await fetch(new URL(path, homeserver), {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Matrix ${method} ${path} failed: ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

async function sendMessage(homeserver, token, roomId, message) {
  return request(homeserver, token, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${crypto.randomUUID()}`, message);
}

module.exports = { eventMessage, timelineMessages, request, sendMessage };
