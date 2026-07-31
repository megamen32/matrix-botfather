const http = require('node:http');

function normalizeAddress(address = '') {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function allowedRemote(address, deniedAddress) {
  return normalizeAddress(address) !== deniedAddress;
}

function createLanProxy({ bindAddress, port, deniedAddress, upstreamHost = '127.0.0.1', upstreamPort = 8092 }) {
  return http.createServer((request, response) => {
    if (!allowedRemote(request.socket.remoteAddress, deniedAddress)) {
      response.writeHead(403, { 'cache-control': 'no-store' });
      return response.end();
    }
    const upstream = http.request({
      host: upstreamHost,
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers: request.headers,
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'cache-control': 'no-store' });
      response.end();
    });
    request.pipe(upstream);
  }).listen(port, bindAddress);
}

if (require.main === module) {
  const bindAddress = process.env.CONTROL_PLANE_LAN_BIND;
  const deniedAddress = process.env.CONTROL_PLANE_DENIED_SOURCE_IP;
  if (!bindAddress || !deniedAddress) throw new Error('CONTROL_PLANE_LAN_BIND and CONTROL_PLANE_DENIED_SOURCE_IP are required');
  createLanProxy({ bindAddress, port: Number(process.env.CONTROL_PLANE_PORT || 8092), deniedAddress });
}

module.exports = { allowedRemote, createLanProxy, normalizeAddress };
