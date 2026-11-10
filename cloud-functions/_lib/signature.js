import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADERS = [
  'x-hub-signature-256',
  'x-signature-256',
  'x-signature',
  'x-webhook-signature',
  'x-shopify-hmac-sha256',
  'stripe-signature',
];

export function findSignatureHeader(headers) {
  for (const name of SIGNATURE_HEADERS) {
    const value = headers?.[name];
    if (typeof value === 'string' && value.trim()) return { name, value: value.trim() };
  }
  const fallback = Object.keys(headers ?? {}).find((key) => /signature/i.test(key) && !key.startsWith('sec-'));
  if (fallback) {
    const value = headers[fallback];
    if (typeof value === 'string' && value.trim()) return { name: fallback, value: value.trim() };
  }
  return null;
}

function compareHex(digest, expected) {
  const normalized = String(expected ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) return false;
  const buffer = Buffer.from(normalized, 'hex');
  return buffer.length === digest.length && timingSafeEqual(buffer, digest);
}

function compareBase64(digest, expected) {
  try {
    const normalized = String(expected ?? '').trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return false;
    const buffer = Buffer.from(normalized, 'base64');
    return buffer.length === digest.length && timingSafeEqual(buffer, digest);
  } catch {
    return false;
  }
}

/**
 * 校验 webhook 签名。支持：
 * - X-Hub-Signature-256: sha256=<hex>（GitHub）
 * - X-Signature / X-Webhook-Signature: <hex> 或 sha256=<hex>
 * - X-Shopify-Hmac-Sha256: <base64>
 * - Stripe-Signature: t=<timestamp>,v1=<hex>（HMAC(t.body)）
 */
export function verifyWebhookSignature(rawBody, headers, secret) {
  if (!secret) return { ok: true, skipped: true };

  const found = findSignatureHeader(headers);
  if (!found) {
    return {
      ok: false,
      reason: `缺少签名头，支持：${SIGNATURE_HEADERS.join(' / ')}`,
    };
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');
  const digest = createHmac('sha256', secret).update(body).digest();
  const value = found.value;

  if (found.name === 'stripe-signature' || /(^|,)\s*v1=/.test(value)) {
    const parts = {};
    for (const segment of value.split(',')) {
      const separator = segment.indexOf('=');
      if (separator === -1) continue;
      parts[segment.slice(0, separator).trim()] = segment.slice(separator + 1).trim();
    }
    if (parts.t && parts.v1) {
      const signed = createHmac('sha256', secret)
        .update(`${parts.t}.`)
        .update(body)
        .digest();
      if (compareHex(signed, parts.v1)) return { ok: true, header: found.name, scheme: 'stripe' };
    }
    if (parts.v1 && compareHex(digest, parts.v1)) return { ok: true, header: found.name };
    return { ok: false, reason: `${found.name} 签名不匹配` };
  }

  let candidate = value;
  const prefixed = value.match(/^(sha256|sha1|sha512|v1|s)=(.+)$/i);
  if (prefixed) candidate = prefixed[2].trim();

  if (compareHex(digest, candidate)) return { ok: true, header: found.name, scheme: 'sha256' };
  if (found.name === 'x-shopify-hmac-sha256' || /^[A-Za-z0-9+/]+={0,2}$/.test(candidate)) {
    if (compareBase64(digest, candidate)) return { ok: true, header: found.name, scheme: 'base64' };
  }

  return { ok: false, reason: `${found.name} 签名不匹配` };
}
