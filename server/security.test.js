import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoles, permissions, token, tokenHash, validText, validUrl } from './security.js';

test('roles are parsed and exact IDs are checked', () => {
  assert.deepEqual([...parseRoles('123, 456,123')], ['123', '456']);
  assert.deepEqual(permissions(['456'], parseRoles('123'), parseRoles('456')), { voter: true, admin: true });
  assert.deepEqual(permissions(['1234'], parseRoles('123'), parseRoles('456')), { voter: false, admin: false });
});
test('tokens are unpredictable and hashed', () => {
  const a = token(), b = token();
  assert.notEqual(a, b);
  assert.equal(tokenHash(a).length, 64);
  assert.notEqual(tokenHash(a), a);
});
test('input validation', () => {
  assert.equal(validText(' a ', 3), true);
  assert.equal(validText('  ', 10), false);
  assert.equal(validText('too long', 3), false);
  assert.equal(validUrl('javascript:alert(1)'), false);
  assert.equal(validUrl('https://modrinth.com/mod/create'), true);
});
