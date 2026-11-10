import { randomBytes } from 'node:crypto';

import { createChannelId } from './channels.js';
import { HttpError } from './errors.js';
import { hashToken } from './auth.js';

export const STATE_VERSION = 2;

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanIdList(value, max = 50) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))].slice(0, max);
}

function emptyWebdav() {
  return { url: '', username: '', password: '', path: 'hookroom-backup.json' };
}

export function migrateState(state) {
  let changed = false;
  if (!state || typeof state !== 'object') {
    return { state: { version: STATE_VERSION, groups: [], channels: [], endpoints: [], events: [], apiKeys: [], auth: null, backup: { webdav: emptyWebdav() } }, changed: true };
  }

  if (!Array.isArray(state.groups)) { state.groups = []; changed = true; }
  if (!Array.isArray(state.channels)) { state.channels = []; changed = true; }
  if (!Array.isArray(state.endpoints)) { state.endpoints = []; changed = true; }
  if (!Array.isArray(state.events)) { state.events = []; changed = true; }
  if (!Array.isArray(state.apiKeys)) { state.apiKeys = []; changed = true; }
  /* 授权模型 v2：单条通知 → 接收端点；旧密钥停用，避免空授权被当成全量权限 */
  for (const key of state.apiKeys) {
    if (!Array.isArray(key.endpointIds)) { key.endpointIds = []; changed = true; }
    if (Array.isArray(key.eventIds)) {
      if (key.eventIds.length && !(key.groupIds ?? []).length && !key.endpointIds.length) {
        key.enabled = false;
        key.note = `${key.note ? `${key.note} · ` : ''}授权模型已改为端点授权，请重新配置`;
      }
      delete key.eventIds;
      changed = true;
    }
  }
  if (state.auth === undefined) { state.auth = null; changed = true; }
  if (typeof state.internalSecret !== 'string' || !state.internalSecret) {
    state.internalSecret = randomBytes(32).toString('hex');
    changed = true;
  }
  if (!state.backup || typeof state.backup !== 'object') { state.backup = { webdav: emptyWebdav() }; changed = true; }
  if (!state.backup.webdav || typeof state.backup.webdav !== 'object') {
    state.backup.webdav = emptyWebdav();
    changed = true;
  } else {
    for (const key of ['url', 'username', 'password']) {
      if (typeof state.backup.webdav[key] !== 'string') { state.backup.webdav[key] = ''; changed = true; }
    }
    if (typeof state.backup.webdav.path !== 'string' || !state.backup.webdav.path) {
      state.backup.webdav.path = 'hookroom-backup.json';
      changed = true;
    }
  }

  const channelIds = new Set(state.channels.map((channel) => channel?.id).filter(Boolean));
  for (const endpoint of state.endpoints) {
    if (Array.isArray(endpoint.channels)) {
      const ids = Array.isArray(endpoint.channelIds) ? endpoint.channelIds : [];
      for (const channel of endpoint.channels) {
        if (!channel || typeof channel !== 'object') continue;
        if (!channel.id) channel.id = createChannelId();
        if (!channelIds.has(channel.id)) {
          state.channels.push(channel);
          channelIds.add(channel.id);
        }
        if (!ids.includes(channel.id)) ids.push(channel.id);
      }
      endpoint.channelIds = [...new Set(ids)];
      delete endpoint.channels;
      changed = true;
    }
    if (!Array.isArray(endpoint.channelIds)) {
      endpoint.channelIds = [];
      changed = true;
    } else {
      const filtered = [...new Set(endpoint.channelIds.filter((id) => channelIds.has(id)))];
      if (filtered.length !== endpoint.channelIds.length) {
        endpoint.channelIds = filtered;
        changed = true;
      } else {
        endpoint.channelIds = filtered;
      }
    }
    if (endpoint.groupId === undefined) {
      endpoint.groupId = '';
      changed = true;
    }
  }

  if (state.version !== STATE_VERSION) {
    state.version = STATE_VERSION;
    changed = true;
  }
  return { state, changed };
}

export function publicApiKey(key) {
  return {
    id: key.id,
    name: key.name,
    note: key.note || '',
    prefix: key.prefix || '',
    groupIds: key.groupIds ?? [],
    endpointIds: key.endpointIds ?? [],
    readOnly: key.readOnly === true,
    enabled: key.enabled !== false,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt || null,
  };
}

export function publicAuth(auth) {
  if (!auth) return { enabled: false };
  return {
    enabled: true,
    username: auth.username,
    totpEnabled: auth.totpEnabled === true,
  };
}

export function publicBackupSettings(backup) {
  const webdav = backup?.webdav ?? emptyWebdav();
  return {
    webdav: {
      url: webdav.url || '',
      username: webdav.username || '',
      path: webdav.path || 'hookroom-backup.json',
      hasPassword: Boolean(webdav.password),
    },
  };
}

export function createApiKeyRecord(input, secret) {
  const name = cleanText(input?.name, 40);
  if (!name) throw new HttpError(400, '密钥名称不能为空');
  return {
    id: `key_${randomBytes(8).toString('hex')}`,
    name,
    note: cleanText(input?.note, 160),
    prefix: `${secret.slice(0, 12)}…`,
    hash: hashToken(secret),
    groupIds: cleanIdList(input?.groupIds),
    endpointIds: cleanIdList(input?.endpointIds),
    readOnly: input?.readOnly === true,
    enabled: input?.enabled !== false,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
}

export function updateApiKeyRecord(existing, input) {
  const next = { ...existing };
  if (input?.name !== undefined) {
    const name = cleanText(input.name, 40);
    if (!name) throw new HttpError(400, '密钥名称不能为空');
    next.name = name;
  }
  if (input?.note !== undefined) next.note = cleanText(input.note, 160);
  if (input?.groupIds !== undefined) next.groupIds = cleanIdList(input.groupIds);
  if (input?.endpointIds !== undefined) next.endpointIds = cleanIdList(input.endpointIds);
  if (input?.readOnly !== undefined) next.readOnly = input.readOnly === true;
  if (input?.enabled !== undefined) next.enabled = input.enabled !== false;
  return next;
}

export function emptyBackupSettings() {
  return { webdav: emptyWebdav() };
}
