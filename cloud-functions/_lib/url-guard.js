import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

import { HttpError } from './errors.js';

/*
 * 出站地址校验：防止把用户可控 URL 变成内网探测 / 云元数据读取（SSRF）。
 *
 * 默认阻断：回环、链路本地（含 169.254.169.254 云元数据）、CGNAT、RFC1918 私网、IPv6 本地地址。
 * 自托管场景需要访问内网 WebDAV / NAS / 本机服务时，设置 HOOKROOM_ALLOW_PRIVATE_TARGETS=1，
 * 放开回环与 RFC1918；链路本地（169.254/16、fe80::/10）始终阻断，防云元数据读取。
 */

const BLOCKED_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.0\.0\./,
  /^192\.168\./,
  /^198\.1[89]\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const ALWAYS_BLOCKED_V4 = [/^0\./, /^169\.254\./];

function normalizeHost(hostname) {
  return String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isIpv6Blocked(address, allowPrivate) {
  const value = address.toLowerCase();
  if (value === '::') return true;
  if (value === '::1') return !allowPrivate; // 回环
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isIpv4Blocked(mapped[1], allowPrivate);
  if (/^fe[89ab]/.test(value)) return true; // fe80::/10 链路本地，含云元数据
  if (/^f[cd]/.test(value)) return !allowPrivate; // fc00::/7 唯一本地
  return false;
}

function isIpv4Blocked(address, allowPrivate) {
  if (ALWAYS_BLOCKED_V4.some((pattern) => pattern.test(address))) return true;
  const privateOnly = BLOCKED_V4.filter((pattern) => !ALWAYS_BLOCKED_V4.includes(pattern));
  return !allowPrivate && privateOnly.some((pattern) => pattern.test(address));
}

export function isBlockedAddress(address, { allowPrivate = false } = {}) {
  const value = String(address ?? '').trim();
  const version = isIP(value);
  if (version === 4) return isIpv4Blocked(value, allowPrivate);
  if (version === 6) return isIpv6Blocked(value, allowPrivate);
  return true;
}

function allowPrivateTargets() {
  return String(process.env.HOOKROOM_ALLOW_PRIVATE_TARGETS ?? '') === '1';
}

export async function assertSafeOutboundUrl(rawUrl, { label = '地址', allowPrivate = allowPrivateTargets() } = {}) {
  let url;
  try {
    url = new URL(String(rawUrl ?? '').trim());
  } catch {
    throw new HttpError(400, `${label}不是合法的 URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new HttpError(400, `${label}只支持 http 或 https`);
  }
  if (url.username || url.password) {
    throw new HttpError(400, `${label}不能包含账号密码`);
  }

  const host = normalizeHost(url.hostname);
  if (!host) throw new HttpError(400, `${label}缺少主机名`);
  if ((host === 'localhost' || host.endsWith('.localhost')) && !allowPrivate) {
    throw new HttpError(400, `${label}不允许指向本机地址`);
  }

  if (isIP(host)) {
    if (isBlockedAddress(host, { allowPrivate })) {
      throw new HttpError(400, `${label}不允许指向内网或保留地址`);
    }
    return url;
  }

  let records;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new HttpError(400, `${label}的域名无法解析`);
  }
  if (!records.length) throw new HttpError(400, `${label}的域名无法解析`);
  if (records.some((record) => isBlockedAddress(record.address, { allowPrivate }))) {
    throw new HttpError(400, `${label}解析到了内网或保留地址`);
  }
  return url;
}