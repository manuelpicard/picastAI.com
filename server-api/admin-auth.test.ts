import assert from 'node:assert/strict';
import test from 'node:test';
import { isAdminTokenConfigured, verifyAdminAuthorization } from './admin-auth.js';

const validToken = 'a'.repeat(64);

test('admin token configuration fails closed', () => {
  assert.equal(isAdminTokenConfigured(undefined), false);
  assert.equal(isAdminTokenConfigured(null), false);
  assert.equal(isAdminTokenConfigured(''), false);
  assert.equal(isAdminTokenConfigured('too-short'), false);
  assert.equal(isAdminTokenConfigured(validToken), true);
});

test('admin bearer authorization requires the exact configured token', () => {
  assert.equal(verifyAdminAuthorization(undefined, validToken), false);
  assert.equal(verifyAdminAuthorization('Basic abc', validToken), false);
  assert.equal(verifyAdminAuthorization('Bearer wrong-token', validToken), false);
  assert.equal(verifyAdminAuthorization(`Bearer ${validToken}`, validToken), true);
  assert.equal(verifyAdminAuthorization(`Bearer ${validToken}`, undefined), false);
  assert.equal(verifyAdminAuthorization(`Bearer ${validToken}`, 'short'), false);
});
