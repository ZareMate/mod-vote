import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function parseRoles(value = '') {
  return new Set(value.split(',').map((role) => role.trim()).filter(Boolean));
}
export function permissions(roles, voterRoles, adminRoles) {
  const userRoles = new Set(roles);
  const admin = [...adminRoles].some((role) => userRoles.has(role));
  const voter = admin || [...voterRoles].some((role) => userRoles.has(role));
  return { voter, admin };
}
export function token() {
  return randomBytes(32).toString('base64url');
}
export function tokenHash(value) {
  return createHash('sha256').update(value).digest('hex');
}
export function safeEqual(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  return left.length === right.length && timingSafeEqual(left, right);
}
export function validText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}
export function validUrl(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
}
