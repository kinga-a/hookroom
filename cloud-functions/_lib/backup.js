import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

import { HttpError } from './errors.js';
import { assertSafeOutboundUrl } from './url-guard.js';
import { generateSessionSecret } from './auth.js';

const BACKUP_FORMAT = 'hookroom-backup';
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export function buildBackup(state, { includeEvents = true } = {}) {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    encrypted: false,
    data: {
      groups: state.groups ?? [],
      channels: state.channels ?? [],
      endpoints: state.endpoints ?? [],
      events: includeEvents ? (state.events ?? []) : [],
      apiKeys: (state.apiKeys ?? []).map((key) => ({ ...key })),
      auth: state.auth
        ? {
          username: state.auth.username,
          passwordSalt: state.auth.passwordSalt,
          passwordHash: state.auth.passwordHash,
          totpSecret: state.auth.totpSecret || '',
          totpEnabled: state.auth.totpEnabled === true,
          createdAt: state.auth.createdAt,
        }
        : null,
    },
  };
}

export function encryptBackup(backup, password) {
  const secret = String(password ?? '');
  if (!secret) {
    throw new HttpError(400, '导出备份必须设置密码：明文备份会包含端点密钥与渠道令牌');
  }
  if (secret.length < 6) {
    throw new HttpError(400, '备份密码至少 6 位');
  }
  const payload = Buffer.from(JSON.stringify(backup), 'utf8');
  if (payload.length > MAX_BACKUP_BYTES) throw new HttpError(400, '备份内容超过 5 MB 限制');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(String(password), salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: backup.exportedAt,
    encrypted: true,
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptBackup(envelope, password) {
  if (!envelope || envelope.encrypted !== true) return envelope;
  if (!password) throw new HttpError(400, '该备份已加密，请填写备份密码');
  try {
    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const data = Buffer.from(envelope.data, 'base64');
    const key = scryptSync(String(password), salt, 32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    throw new HttpError(400, '备份解密失败：密码错误或文件已损坏');
  }
}

export function parseBackup(input, password) {
  let envelope = input;
  if (typeof input === 'string') {
    try {
      envelope = JSON.parse(input);
    } catch {
      throw new HttpError(400, '备份文件不是合法 JSON');
    }
  }
  if (!envelope || envelope.format !== BACKUP_FORMAT) {
    throw new HttpError(400, '不是 Hookroom 备份文件');
  }
  const backup = decryptBackup(envelope, password);
  const data = backup?.data;
  if (!data || typeof data !== 'object') throw new HttpError(400, '备份内容为空');
  for (const key of ['groups', 'channels', 'endpoints', 'events', 'apiKeys']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new HttpError(400, `备份中的 ${key} 格式不正确`);
    }
  }
  if (data.auth !== null && data.auth !== undefined && typeof data.auth !== 'object') {
    throw new HttpError(400, '备份中的认证配置格式不正确');
  }
  return data;
}

export function normalizeRestoredAuth(auth) {
  if (!auth || typeof auth !== 'object') return null;
  if (typeof auth.username !== 'string' || typeof auth.passwordHash !== 'string' || typeof auth.passwordSalt !== 'string') {
    return null;
  }
  return {
    username: auth.username.slice(0, 60),
    passwordSalt: auth.passwordSalt,
    passwordHash: auth.passwordHash,
    totpSecret: typeof auth.totpSecret === 'string' ? auth.totpSecret : '',
    totpEnabled: auth.totpEnabled === true,
    pendingTotpSecret: '',
    sessionSecret: generateSessionSecret(),
    createdAt: typeof auth.createdAt === 'string' ? auth.createdAt : new Date().toISOString(),
  };
}

function webdavHeaders(settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.username) {
    headers.Authorization = `Basic ${Buffer.from(`${settings.username}:${settings.password ?? ''}`).toString('base64')}`;
  }
  return headers;
}

function webdavTarget(settings) {
  let base;
  try {
    base = new URL(String(settings.url ?? ''));
  } catch {
    throw new HttpError(400, 'WebDAV 地址不是合法 URL');
  }
  if (!['http:', 'https:'].includes(base.protocol)) throw new HttpError(400, 'WebDAV 只支持 http 或 https');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const path = String(settings.path || 'hookroom-backup.json').replace(/^\/+/, '');
  return new URL(path, base);
}

export async function uploadWebdav(settings, content) {
  const target = webdavTarget(settings);
  await assertSafeOutboundUrl(target.href, { label: 'WebDAV 地址' });
  let response;
  try {
    response = await fetch(target, {
      method: 'PUT',
      headers: webdavHeaders(settings),
      body: content,
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    throw new HttpError(502, `WebDAV 连接失败：${error?.cause?.code || error?.message || '无法访问服务器'}`);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => ''))
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    throw new HttpError(502, `WebDAV 上传失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`);
  }
  return { url: target.href };
}

export async function downloadWebdav(settings) {
  const target = webdavTarget(settings);
  await assertSafeOutboundUrl(target.href, { label: 'WebDAV 地址' });
  let response;
  try {
    response = await fetch(target, {
      method: 'GET',
      headers: webdavHeaders(settings),
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    throw new HttpError(502, `WebDAV 连接失败：${error?.cause?.code || error?.message || '无法访问服务器'}`);
  }
  if (!response.ok) {
    throw new HttpError(502, `WebDAV 下载失败（HTTP ${response.status}）`);
  }
  return response.text();
}
