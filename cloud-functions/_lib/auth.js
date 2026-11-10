import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generatePasswordHash(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = scryptSync(String(password), String(salt), 64);
    const expected = Buffer.from(String(expectedHash), 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input) {
  const normalized = String(input).toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of normalized) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret, timestamp = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter % 0x100000000, 4);
  const digest = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret, code, window = 1) {
  const normalized = String(code).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized) || !secret) return false;
  const actual = Buffer.from(normalized, 'utf8');
  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = Buffer.from(totpCode(secret, now + offset * 30_000), 'utf8');
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true;
  }
  return false;
}

export function totpUri(secret, username, issuer = 'Hookroom') {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({ secret, issuer });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateApiKeySecret() {
  return `hk_${randomBytes(24).toString('hex')}`;
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function safeHashEqual(leftHash, rightHash) {
  const left = Buffer.from(String(leftHash), 'hex');
  const right = Buffer.from(String(rightHash), 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signSession(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySession(value, secret) {
  if (!value || !secret) return null;
  const [encoded, signature] = String(value).split('.');
  if (!encoded || !signature) return null;
  const expected = createHmac('sha256', secret).update(encoded).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateSessionSecret() {
  return randomBytes(32).toString('hex');
}
