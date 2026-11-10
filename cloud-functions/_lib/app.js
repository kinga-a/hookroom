import { randomBytes } from 'node:crypto';

import {
  HttpError,
  MAX_EVENTS,
  MAX_STORED_BODY,
  buildStats,
  createId,
  mergeEndpointSecrets,
  validateEndpointList,
} from './state.js';
import { createEventStore, EVENT_INDEX_KEY } from './event-store.js';
import { verifyWebhookSignature } from './signature.js';
import { seedState } from './seed.js';
import { CHANNEL_TYPES } from './channel-catalog.js';
import { normalizeChannels, publicChannel } from './channels.js';
import { normalizeGroups } from './groups.js';
import { buildNotificationPayload, sendToChannels } from './notify.js';
import {
  migrateState,
  publicApiKey,
  publicAuth,
  publicBackupSettings,
  emptyBackupSettings,
  createApiKeyRecord,
  updateApiKeyRecord,
} from './state-schema.js';
import {
  generatePasswordHash,
  generateSessionSecret,
  generateTotpSecret,
  signSession,
  totpUri,
  verifyPassword,
  verifySession,
  verifyTotp,
  hashToken,
  safeHashEqual,
} from './auth.js';
import {
  buildBackup,
  encryptBackup,
  parseBackup,
  uploadWebdav,
  downloadWebdav,
} from './backup.js';
import { buildRestoredState } from './restore.js';
import { assertSafeOutboundUrl } from './url-guard.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function json(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function toPublicEndpoint(endpoint) {
  const { secret, ...rest } = endpoint;
  return {
    ...rest,
    hasSecret: Boolean(secret),
  };
}

const SESSION_COOKIE = 'hookroom_session';

function parseCookies(header) {
  const result = {};
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      result[key] = part.slice(index + 1).trim();
    }
  }
  return result;
}

function isSecureRequest(request) {
  return new URL(request.url).protocol === 'https:'
    || String(request.headers.get('x-forwarded-proto') ?? '').includes('https');
}

function sessionForRequest(request, auth) {
  if (!auth) return null;
  const token = parseCookies(request.headers.get('cookie') ?? '')[SESSION_COOKIE];
  return verifySession(token, auth.sessionSecret);
}

function sessionCookie(auth, username, request) {
  const tokenValue = signSession({
    u: username,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  }, auth.sessionSecret);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(tokenValue)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=604800',
  ];
  if (isSecureRequest(request)) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie(request) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecureRequest(request)) parts.push('Secure');
  return parts.join('; ');
}

function authStatus(request, auth) {
  const session = sessionForRequest(request, auth);
  return {
    enabled: Boolean(auth),
    authenticated: !auth || Boolean(session),
    username: auth?.username ?? '',
    totpEnabled: auth?.totpEnabled === true,
  };
}

async function readState(store) {
  let state = await store.read();
  if (!state) {
    state = seedState();
    await store.write(state);
  }
  const migration = migrateState(state);
  if (migration.changed) {
    state = migration.state;
    await store.write(state);
  }
  return state;
}

async function readBytes(request, limit) {
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > limit) throw new HttpError(413, `请求体超过 ${Math.round(limit / 1024)} KB 限制`);
  return buffer;
}

async function readJsonBody(request, limit = 512 * 1024) {
  const buffer = await readBytes(request, limit);
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new HttpError(400, '请求体不是合法的 JSON');
  }
}

function truncateBody(buffer) {
  if (buffer.length <= MAX_STORED_BODY) return { body: buffer.toString('utf8'), truncated: false };
  return {
    body: `${buffer.subarray(0, MAX_STORED_BODY).toString('utf8')}\n\n…（内容已截断）`,
    truncated: true,
  };
}

function clientIp(request) {
  const header = request.headers.get('eo-client-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')
    || '';
  return String(header)
    .split(',')[0]
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 80);
}

function sanitizeForwardHeaders(headers) {
  const blocked = new Set([
    'host', 'content-length', 'connection', 'transfer-encoding',
    'accept-encoding', 'keep-alive', 'upgrade', 'proxy-authorization',
  ]);
  const result = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (blocked.has(key.toLowerCase())) continue;
    result[key] = value;
  }
  return result;
}

function errorResponse(error) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status === 500) console.error('[edgeone]', error);
  return json(status, {
    ok: false,
    error: error instanceof HttpError ? error.message : '服务器内部错误',
  });
}


/* 读取配置状态；首次访问旧版（events 混在 state.json）时自动拆成分片 */
async function readAppState(store) {
  const eventStore = createEventStore(store);
  const state = await readState(store);
  if (Object.prototype.hasOwnProperty.call(state, 'events')) {
    await eventStore.migrate(state);
    await store.write(state);
  }
  return { state, eventStore };
}

async function statsWithEvents(eventStore, state) {
  const counters = await eventStore.readCounters();
  return buildStats(state, null, counters);
}

export async function handleHook(request, store) {
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/hook\/([a-z0-9-]{2,40})(\/.*)?$/);
    if (!match) return json(404, { ok: false, error: '接收端点不存在' }, CORS);

    const slug = match[1];
    const subPath = match[2] ?? '';
    const { state, eventStore } = await readAppState(store);
    const endpoint = state.endpoints.find((item) => item.slug === slug);

    if (!endpoint) return json(404, { ok: false, error: '接收端点不存在', slug }, CORS);
    if (!endpoint.active) {
      return json(410, { ok: false, error: '接收端点已暂停，请求未被记录', slug }, CORS);
    }

    const raw = await readBytes(request, 1024 * 1024);
    const { body, truncated } = truncateBody(raw);

    let signatureValid = null;
    let signatureError = null;
    if (endpoint.secret) {
      const result = verifyWebhookSignature(raw, Object.fromEntries(request.headers.entries()), endpoint.secret);
      signatureValid = result.ok;
      if (!result.ok) signatureError = result.reason;
    }

    const headers = Object.fromEntries(request.headers.entries());
    const ip = clientIp(request);
    const event = {
      id: createId('evt'),
      endpointId: endpoint.id,
      slug,
      method: request.method,
      path: `/hook/${slug}${subPath}`,
      query: Object.fromEntries(url.searchParams.entries()),
      headers,
      body,
      bodyBytes: raw.length,
      truncated,
      contentType: headers['content-type'] ?? '',
      ip,
      receivedAt: new Date().toISOString(),
      replayOf: null,
      signatureValid,
      forwarding: [],
    };

    const endpointChannels = (state.channels ?? []).filter(
      (channel) => (endpoint.channelIds ?? []).includes(channel.id),
    );
    if (!signatureError && endpointChannels.length) {
      event.forwarding = await sendToChannels(
        endpointChannels,
        buildNotificationPayload(event, endpoint),
      );
    }

    await eventStore.append(event);

    if (signatureError) {
      console.warn(`[edgeone] 签名校验失败 ${slug} from ${ip}: ${signatureError}`);
      return json(401, {
        ok: false,
        error: '签名校验失败',
        detail: signatureError,
        id: event.id,
      }, CORS);
    }

    return json(200, {
      ok: true,
      id: event.id,
      endpoint: endpoint.slug,
      receivedAt: event.receivedAt,
      forwarding: {
        attempted: event.forwarding.length,
        success: event.forwarding.filter((item) => item.success).length,
        failed: event.forwarding.filter((item) => !item.success).length,
      },
    }, CORS);
  } catch (error) {
    return errorResponse(error);
  }
}

async function applyBackupData(data, store, request, currentState, mode = 'merge') {
  const restored = buildRestoredState(currentState, data, mode);
  const eventStore = createEventStore(store);
  await eventStore.migrate(restored.state);
  await store.write(restored.state);
  const auth = restored.state.auth ?? null;

  return {
    headers: auth
      ? { 'Set-Cookie': sessionCookie(auth, auth.username, request) }
      : { 'Set-Cookie': clearSessionCookie(request) },
    result: {
      ok: true,
      mode,
      summary: restored.summary,
      auth: publicAuth(auth),
      stats: buildStats(restored.state, null, await eventStore.readCounters()),
    },
  };
}

export async function handleApi(request, store) {
  try {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();
    const { state: initialState, eventStore } = await readAppState(store);
    const auth = initialState.auth ?? null;
    const publicPaths = new Set(['/api/health', '/api/auth/status', '/api/auth/login']);

    if (auth && !publicPaths.has(pathname)) {
      const session = sessionForRequest(request, auth);
      const internalHeader = String(request.headers.get('x-hookroom-internal') ?? '');
      const internalOk = internalHeader && safeHashEqual(hashToken(internalHeader), hashToken(initialState.internalSecret ?? ''));
      if (!session && !internalOk) {
        return json(401, { ok: false, error: '需要登录', authRequired: true });
      }
    }

    if (pathname === '/api/health' && method === 'GET') {
      return json(200, { ok: true, runtime: 'edgeone' });
    }

    if (pathname === '/api/auth/status' && method === 'GET') {
      return json(200, { ok: true, ...authStatus(request, auth) });
    }

    if (pathname === '/api/auth/enable' && method === 'POST') {
      if (auth) throw new HttpError(400, '账号保护已经启用');
      const payload = await readJsonBody(request);
      const username = String(payload.username ?? '').trim().slice(0, 60);
      const password = String(payload.password ?? '');
      if (!username) throw new HttpError(400, '请填写账号');
      if (password.length < 8) throw new HttpError(400, '密码至少 8 位');
      const passwordData = generatePasswordHash(password);
      const nextAuth = {
        username,
        passwordSalt: passwordData.salt,
        passwordHash: passwordData.hash,
        totpSecret: '',
        totpEnabled: false,
        pendingTotpSecret: '',
        sessionSecret: generateSessionSecret(),
        createdAt: new Date().toISOString(),
      };
      initialState.auth = nextAuth;
      await store.write(initialState);
      return json(200, { ok: true, auth: publicAuth(nextAuth) }, {
        'Set-Cookie': sessionCookie(nextAuth, username, request),
      });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      if (!auth) throw new HttpError(400, '账号保护未启用');
      const payload = await readJsonBody(request);
      const username = String(payload.username ?? '');
      const password = String(payload.password ?? '');
      const code = String(payload.totp ?? '');
      const passwordOk = username === auth.username && verifyPassword(password, auth.passwordSalt, auth.passwordHash);
      if (!passwordOk || (auth.totpEnabled && !verifyTotp(auth.totpSecret, code))) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return json(401, { ok: false, error: auth.totpEnabled ? '账号、密码或验证码错误' : '账号或密码错误' });
      }
      return json(200, { ok: true, ...authStatus(request, auth) }, {
        'Set-Cookie': sessionCookie(auth, auth.username, request),
      });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      return json(200, { ok: true }, { 'Set-Cookie': clearSessionCookie(request) });
    }

    if (pathname === '/api/auth/password' && method === 'POST') {
      if (!auth) throw new HttpError(400, '账号保护未启用');
      const payload = await readJsonBody(request);
      if (!verifyPassword(String(payload.currentPassword ?? ''), auth.passwordSalt, auth.passwordHash)) {
        throw new HttpError(401, '当前密码错误');
      }
      const newPassword = String(payload.newPassword ?? '');
      if (newPassword.length < 8) throw new HttpError(400, '新密码至少 8 位');
      const passwordData = generatePasswordHash(newPassword);
      const nextAuth = {
        ...auth,
        passwordSalt: passwordData.salt,
        passwordHash: passwordData.hash,
        sessionSecret: generateSessionSecret(),
        updatedAt: new Date().toISOString(),
      };
      initialState.auth = nextAuth;
      await store.write(initialState);
      return json(200, { ok: true }, {
        'Set-Cookie': sessionCookie(nextAuth, nextAuth.username, request),
      });
    }

    if (pathname === '/api/auth/totp/setup' && method === 'POST') {
      if (!auth) throw new HttpError(400, '账号保护未启用');
      const secret = generateTotpSecret();
      initialState.auth = { ...auth, pendingTotpSecret: secret };
      await store.write(initialState);
      return json(200, { ok: true, secret, uri: totpUri(secret, auth.username) });
    }

    if (pathname === '/api/auth/totp/confirm' && method === 'POST') {
      if (!auth || !auth.pendingTotpSecret) throw new HttpError(400, '请先生成 TOTP 密钥');
      const payload = await readJsonBody(request);
      if (!verifyTotp(auth.pendingTotpSecret, payload.code)) throw new HttpError(401, '验证码不正确');
      const nextAuth = {
        ...auth,
        totpSecret: auth.pendingTotpSecret,
        totpEnabled: true,
        pendingTotpSecret: '',
        updatedAt: new Date().toISOString(),
      };
      initialState.auth = nextAuth;
      await store.write(initialState);
      return json(200, { ok: true, auth: publicAuth(nextAuth) });
    }

    if (pathname === '/api/auth/totp/disable' && method === 'POST') {
      if (!auth) throw new HttpError(400, '账号保护未启用');
      const payload = await readJsonBody(request);
      if (!verifyPassword(String(payload.password ?? ''), auth.passwordSalt, auth.passwordHash)) {
        throw new HttpError(401, '密码错误');
      }
      const nextAuth = {
        ...auth,
        totpEnabled: false,
        totpSecret: '',
        pendingTotpSecret: '',
        updatedAt: new Date().toISOString(),
      };
      initialState.auth = nextAuth;
      await store.write(initialState);
      return json(200, { ok: true, auth: publicAuth(nextAuth) });
    }

    if (pathname === '/api/auth/disable' && method === 'POST') {
      if (!auth) throw new HttpError(400, '账号保护未启用');
      const payload = await readJsonBody(request);
      if (!verifyPassword(String(payload.password ?? ''), auth.passwordSalt, auth.passwordHash)) {
        throw new HttpError(401, '密码错误');
      }
      initialState.auth = null;
      await store.write(initialState);
      return json(200, { ok: true, auth: publicAuth(null) }, {
        'Set-Cookie': clearSessionCookie(request),
      });
    }

    if (pathname === '/api/channel-types' && method === 'GET') {
      return json(200, { types: CHANNEL_TYPES });
    }

    if (pathname === '/api/stream' && method === 'GET') {
      return json(501, {
        ok: false,
        error: 'EdgeOne 环境不支持 SSE 长连接，前端已切换为轮询同步',
      });
    }

    if (pathname === '/api/state' && method === 'GET') {
      const state = initialState;
      return json(200, {
        groups: state.groups ?? [],
        channels: (state.channels ?? []).map(publicChannel),
        endpoints: state.endpoints.map(toPublicEndpoint),
        apiKeys: (state.apiKeys ?? []).map(publicApiKey),
        auth: publicAuth(state.auth),
        backup: publicBackupSettings(state.backup),
        stats: await statsWithEvents(eventStore, state),
        maxEvents: MAX_EVENTS,
        storageMode: 'cloud',
        realtime: false,
      });
    }


    if (pathname === '/api/channels' && method === 'PUT') {
      const payload = await readJsonBody(request);
      const channels = normalizeChannels(payload.channels, initialState.channels ?? []);
      initialState.channels = channels;
      const validIds = new Set(channels.map((channel) => channel.id));
      for (const endpoint of initialState.endpoints) {
        endpoint.channelIds = (endpoint.channelIds ?? []).filter((id) => validIds.has(id));
      }
      await store.write(initialState);
      return json(200, {
        channels: channels.map(publicChannel),
        endpoints: initialState.endpoints.map(toPublicEndpoint),
        stats: await statsWithEvents(eventStore, initialState),
      });
    }

    if (pathname === '/api/settings/webdav' && method === 'PUT') {
      const payload = await readJsonBody(request);
      const webdav = payload.webdav ?? {};
      if (webdav.url) {
        try {
          const parsed = new URL(String(webdav.url));
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
        } catch {
          throw new HttpError(400, 'WebDAV 地址不是合法的 http/https URL');
        }
      }
      const current = initialState.backup?.webdav ?? {};
      initialState.backup = {
        webdav: {
          url: typeof webdav.url === 'string' ? webdav.url.trim().slice(0, 500) : current.url ?? '',
          username: typeof webdav.username === 'string' ? webdav.username.trim().slice(0, 100) : current.username ?? '',
          password: typeof webdav.password === 'string' && webdav.password ? webdav.password.slice(0, 500) : current.password ?? '',
          path: typeof webdav.path === 'string' ? webdav.path.trim().slice(0, 200) : (current.path ?? ''),
        },
      };
      await store.write(initialState);
      return json(200, { ok: true, backup: publicBackupSettings(initialState.backup) });
    }

    if (pathname === '/api/api-keys' && method === 'POST') {
      const payload = await readJsonBody(request);
      const groups = initialState.groups ?? [];
      const groupIds = Array.isArray(payload.groupIds)
        ? payload.groupIds.filter((id) => groups.some((group) => group.id === id))
        : [];
      const knownEndpointIds = new Set(initialState.endpoints.map((endpoint) => endpoint.id));
      const endpointIds = Array.isArray(payload.endpointIds)
        ? payload.endpointIds.filter((id) => knownEndpointIds.has(id))
        : [];
      if (!payload.all && !groupIds.length && !endpointIds.length) {
        throw new HttpError(400, '请选择授权范围，或选择全部权限');
      }
      const secret = `hk_${randomBytes(24).toString('hex')}`;
      const key = createApiKeyRecord({
        name: payload.name,
        note: payload.note,
        groupIds,
        endpointIds,
        readOnly: payload.readOnly === true,
      }, secret);
      initialState.apiKeys.push(key);
      await store.write(initialState);
      return json(200, { ok: true, key: publicApiKey(key), secret });
    }

    const apiKeyMatch = pathname.match(/^\/api\/api-keys\/(key_[a-z0-9]{6,32})$/);
    if (apiKeyMatch && method === 'PUT') {
      const payload = await readJsonBody(request);
      const groups = initialState.groups ?? [];
      const groupIds = Array.isArray(payload.groupIds)
        ? payload.groupIds.filter((id) => groups.some((group) => group.id === id))
        : undefined;
      const knownEndpointIds = new Set(initialState.endpoints.map((endpoint) => endpoint.id));
      const endpointIds = Array.isArray(payload.endpointIds)
        ? payload.endpointIds.filter((id) => knownEndpointIds.has(id))
        : undefined;
      if (payload.all === false && (groupIds ?? []).length === 0 && (endpointIds ?? []).length === 0) {
        throw new HttpError(400, '请选择授权范围，或选择全部权限');
      }
      const index = initialState.apiKeys.findIndex((key) => key.id === apiKeyMatch[1]);
      if (index === -1) throw new HttpError(404, 'MCP 密钥不存在');
      const next = updateApiKeyRecord(initialState.apiKeys[index], {
        ...payload,
        groupIds: payload.all === true ? [] : groupIds,
        endpointIds: payload.all === true ? [] : endpointIds,
      });
      initialState.apiKeys[index] = next;
      await store.write(initialState);
      return json(200, { ok: true, key: publicApiKey(next) });
    }
    if (apiKeyMatch && method === 'DELETE') {
      const index = initialState.apiKeys.findIndex((key) => key.id === apiKeyMatch[1]);
      if (index === -1) throw new HttpError(404, 'MCP 密钥不存在');
      const [removed] = initialState.apiKeys.splice(index, 1);
      await store.write(initialState);
      return json(200, { ok: true, key: publicApiKey(removed) });
    }

    if (pathname === '/api/backup/export' && method === 'POST') {
      const payload = await readJsonBody(request, 256 * 1024);
      const includeEvents = payload.includeEvents !== false;
      const backup = buildBackup(
        { ...initialState, events: includeEvents ? await eventStore.readAll() : [] },
        { includeEvents },
      );
      const envelope = encryptBackup(backup, String(payload.password ?? ''));
      const content = JSON.stringify(envelope, null, 2);
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="hookroom-backup-${new Date().toISOString().slice(0, 10)}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (pathname === '/api/backup/import' && method === 'POST') {
      const payload = await readJsonBody(request, 5 * 1024 * 1024);
      const data = parseBackup(payload.backup, String(payload.password ?? ''));
      const mode = payload.mode === 'overwrite' ? 'overwrite' : 'merge';
      const applied = await applyBackupData(data, store, request, initialState, mode);
      return json(200, applied.result, applied.headers);
    }

    if (pathname === '/api/backup/webdav' && method === 'POST') {
      const payload = await readJsonBody(request, 256 * 1024);
      const settings = initialState.backup ?? emptyBackupSettings();
      if (!settings.webdav?.url) throw new HttpError(400, '请先配置 WebDAV 地址');
      const includeEvents = payload.includeEvents !== false;
      const backup = buildBackup(
        { ...initialState, events: includeEvents ? await eventStore.readAll() : [] },
        { includeEvents },
      );
      const envelope = encryptBackup(backup, String(payload.password ?? ''));
      const content = JSON.stringify(envelope, null, 2);
      const uploaded = await uploadWebdav(settings.webdav, content);
      return json(200, {
        ok: true,
        url: uploaded.url,
        path: uploaded.path,
        bytes: new TextEncoder().encode(content).length,
        encrypted: Boolean(payload.password),
        exportedAt: backup.exportedAt,
      });
    }

    if (pathname === '/api/backup/webdav/restore' && method === 'POST') {
      const payload = await readJsonBody(request, 256 * 1024);
      const settings = initialState.backup ?? emptyBackupSettings();
      if (!settings.webdav?.url) throw new HttpError(400, '请先配置 WebDAV 地址');
      const content = await downloadWebdav(settings.webdav);
      const data = parseBackup(content, String(payload.password ?? ''));
      const mode = payload.mode === 'overwrite' ? 'overwrite' : 'merge';
      const applied = await applyBackupData(data, store, request, initialState, mode);
      return json(200, applied.result, applied.headers);
    }

    if (pathname === '/api/groups' && method === 'PUT') {
      const payload = await readJsonBody(request);
      const state = await readState(store);
      const groups = normalizeGroups(payload.groups, state.groups ?? []);
      state.groups = groups;
      const validIds = new Set(groups.map((group) => group.id));
      for (const endpoint of state.endpoints) {
        if (endpoint.groupId && !validIds.has(endpoint.groupId)) endpoint.groupId = '';
      }
      await store.write(state);
      return json(200, {
        groups,
        endpoints: state.endpoints.map(toPublicEndpoint),
        stats: await statsWithEvents(eventStore, state),
      });
    }

    if (pathname === '/api/endpoints' && method === 'PUT') {
      const payload = await readJsonBody(request);
      const state = await readState(store);
      const incoming = validateEndpointList(
        payload.endpoints,
        state.endpoints,
        new Set((state.groups ?? []).map((group) => group.id)),
        new Set((state.channels ?? []).map((channel) => channel.id)),
      );
      const next = mergeEndpointSecrets(incoming, state.endpoints);
      const validIds = new Set(next.map((endpoint) => endpoint.id));
      const removedIds = state.endpoints.filter((endpoint) => !validIds.has(endpoint.id)).map((endpoint) => endpoint.id);
      state.endpoints = next;
      await store.write(state);
      for (const removedId of removedIds) await eventStore.clear(removedId);
      return json(200, {
        endpoints: next.map(toPublicEndpoint),
        stats: await statsWithEvents(eventStore, state),
      });
    }

    if (pathname === '/api/events' && method === 'GET') {
      const endpointId = url.searchParams.get('endpointId') || '';
      const filterMethod = (url.searchParams.get('method') || '').toUpperCase();
      const since = url.searchParams.get('since') || '';
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), MAX_EVENTS);
      const events = await eventStore.list({ endpointId, method: filterMethod, since, limit });
      return json(200, { events, stats: await statsWithEvents(eventStore, initialState) });
    }

    if (pathname === '/api/events' && method === 'DELETE') {
      const endpointId = url.searchParams.get('endpointId') || '';
      const removed = await eventStore.clear(endpointId);
      return json(200, { ok: true, removed });
    }

    const eventMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)$/);
    if (eventMatch) {
      const event = await eventStore.get(eventMatch[1]);
      if (!event) return json(404, { ok: false, error: '请求记录不存在' });

      if (method === 'GET') return json(200, { event });

      if (method === 'DELETE') {
        await eventStore.remove(event.id);
        return json(200, { ok: true });
      }
    }

    const forwardMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)\/forward$/);
    if (forwardMatch && method === 'POST') {
      const event = await eventStore.get(forwardMatch[1]);
      if (!event) return json(404, { ok: false, error: '请求记录不存在' });
      const endpoint = initialState.endpoints.find((item) => item.id === event.endpointId);
      if (!endpoint) return json(404, { ok: false, error: '端点不存在，无法重发' });

      const failedIds = new Set(
        (event.forwarding ?? []).filter((item) => !item.success).map((item) => item.channelId),
      );
      const targets = (initialState.channels ?? []).filter(
        (channel) => (endpoint.channelIds ?? []).includes(channel.id)
          && failedIds.has(channel.id)
          && channel.enabled !== false,
      );
      if (!targets.length) throw new HttpError(400, '没有可重发的失败渠道');

      const results = await sendToChannels(targets, buildNotificationPayload(event, endpoint));
      const resultById = new Map(results.map((item) => [item.channelId, item]));
      event.forwarding = (event.forwarding ?? []).map(
        (item) => resultById.get(item.channelId) ?? item,
      );
      await eventStore.replace(event);
      return json(200, { ok: true, event, forwarding: event.forwarding });
    }

    const replayMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)\/replay$/);
    if (replayMatch && method === 'POST') {
      const event = await eventStore.get(replayMatch[1]);
      if (!event) return json(404, { ok: false, error: '请求记录不存在' });

      const payload = await readJsonBody(request, 64 * 1024);
      const endpoint = initialState.endpoints.find((item) => item.id === event.endpointId);
      const targetValue = String(payload.url || endpoint?.targetUrl || '').trim();
      if (!targetValue) throw new HttpError(400, '请先填写转发地址，或在端点中配置默认转发地址');

      /* 防 SSRF：拒绝回环、内网、链路本地（含云元数据）地址 */
      const target = await assertSafeOutboundUrl(targetValue, { label: '转发地址' });

      const forwardMethod = event.method === 'HEAD' ? 'GET' : event.method;
      const init = {
        method: forwardMethod,
        headers: sanitizeForwardHeaders(event.headers),
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      };
      if (!['GET', 'HEAD'].includes(forwardMethod) && event.body) init.body = event.body;

      const started = Date.now();
      try {
        const upstream = await fetch(target, init);
        const preview = (await upstream.text()).slice(0, 4000);
        return json(200, {
          ok: true,
          status: upstream.status,
          durationMs: Date.now() - started,
          target: target.href,
          responsePreview: preview,
        });
      } catch (error) {
        throw new HttpError(502, `转发失败：${error.name === 'TimeoutError' ? '目标地址 10 秒内未响应' : error.message}`);
      }
    }

    return json(404, { ok: false, error: '接口不存在' });
  } catch (error) {
    return errorResponse(error);
  }
}
