const assert = require('node:assert/strict');
const test = require('node:test');
const { allowedRemote, normalizeAddress } = require('../deploy/lanProxy');

test('LAN proxy rejects only the network gateway source address', () => {
  assert.equal(normalizeAddress('::ffff:192.168.2.100'), '192.168.2.100');
  assert.equal(allowedRemote('::ffff:192.168.2.100', '192.168.2.1'), true);
  assert.equal(allowedRemote('192.168.2.44', '192.168.2.1'), true);
  assert.equal(allowedRemote('192.168.2.88', '192.168.2.1'), true);
  assert.equal(allowedRemote('192.168.2.1', '192.168.2.1'), false);
});
