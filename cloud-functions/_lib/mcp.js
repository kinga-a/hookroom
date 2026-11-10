import { createHash, timingSafeEqual } from 'node:crypto';

import { hashToken, safeHashEqual } from './auth.js';

const SERVER_INFO = { name: 'hookroom', version: '1.3.0' };
const DEFAULT_PROTOCOL = '2025-03-26';

const TOOLS = [
  {
    name: 'list_groups',
    description: '列出所有端点分组及每个分组下的端点数。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_group',
    description: '创建新的端点分组，例如“运维”或“开发”。',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: '分组名称，最多 30 个字符' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'rename_group',
    description: '重命名现有分组，端点归属保持不变。',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: '分组 ID' },
        name: { type: 'string', description: '新的分组名称' },
      },
      required: ['groupId', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_group',
    description: '删除分组，组内端点会移动到“未分组”，端点本身不会被删除。',
    inputSchema: {
      type: 'object',
      properties: { groupId: { type: 'string' } },
      required: ['groupId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_endpoints',
    description: '列出接收端点，可按分组过滤，返回端点名称、路径、分组、通知渠道数量等。',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: '可选，只返回该分组下的端点' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_endpoint',
    description: '创建新的 Webhook 接收端点，可同时配置分组、签名密钥和通知渠道。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string', description: '接收路径，小写字母/数字/中划线，2-40 位' },
        description: { type: 'string' },
        groupId: { type: 'string', description: '分组 ID，留空表示未分组' },
        targetUrl: { type: 'string', description: '仅用于手动重放的默认地址' },
        secret: { type: 'string', description: '可选签名密钥' },
        channelIds: {
          type: 'array',
          description: '全局通知渠道 ID 数组，可先用 list_channels 查看已有渠道',
          items: { type: 'string' },
        },
      },
      required: ['name', 'slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_endpoint',
    description: '更新端点配置，包括名称、路径、分组、说明、重放地址、签名密钥、通知渠道和启用状态。',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        groupId: { type: 'string', description: '传空字符串表示未分组' },
        targetUrl: { type: 'string' },
        active: { type: 'boolean' },
        secret: { type: 'string', description: '设置新的签名密钥' },
        clearSecret: { type: 'boolean', description: '为 true 时清除签名密钥' },
        channelIds: {
          type: 'array',
          description: '全局通知渠道 ID 数组',
          items: { type: 'string' },
        },
      },
      required: ['endpointId'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_endpoint',
    description: '删除端点及其历史请求记录。此操作不可恢复。',
    inputSchema: {
      type: 'object',
      properties: { endpointId: { type: 'string' } },
      required: ['endpointId'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_endpoint_active',
    description: '暂停或启用端点。暂停后请求会返回 410 且不会被记录。',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string' },
        active: { type: 'boolean' },
      },
      required: ['endpointId', 'active'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_notifications',
    description: '查看收到的 Webhook 通知消息，可按端点、分组、HTTP 方法和时间过滤，返回摘要列表。',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string' },
        groupId: { type: 'string' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        since: { type: 'string', description: 'ISO 时间，只返回该时间之后的记录' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: '默认 20' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_notification',
    description: '获取单条通知消息的完整详情，包括请求头、查询参数和请求体。',
    inputSchema: {
      type: 'object',
      properties: { eventId: { type: 'string' } },
      required: ['eventId'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_notification',
    description: '删除单条通知消息。',
    inputSchema: {
      type: 'object',
      properties: { eventId: { type: 'string' } },
      required: ['eventId'],
      additionalProperties: false,
    },
  },
  {
    name: 'clear_notifications',
    description: '清空通知记录；传入 endpointId 时只清空该端点。',
    inputSchema: {
      type: 'object',
      properties: { endpointId: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'resend_notification',
    description: '重发某条通知中发送失败的通知渠道（不会重发成功的渠道）。',
    inputSchema: {
      type: 'object',
      properties: { eventId: { type: 'string' } },
      required: ['eventId'],
      additionalProperties: false,
    },
  },
  {
    name: 'replay_notification',
    description: '把原始请求重放到一个 HTTP 地址；不传 url 时使用端点配置的默认重放地址。',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        url: { type: 'string' },
      },
      required: ['eventId'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_test_notification',
    description: '向指定端点发送一条测试 Webhook，验证接收和通知渠道是否正常。',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string' },
        slug: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_channels',
    description: '列出已配置的全局通知渠道（不包含密钥），返回 id、类型、名称和启用状态。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_channel_types',
    description: '列出支持的通知渠道类型及每种类型需要填写的配置字段。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_stats',
    description: '获取端点、分组和通知记录的总体统计。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function safeTokenEqual(left, right) {
  const a = createHash('sha256').update(String(left)).digest();
  const b = createHash('sha256').update(String(right)).digest();
  return timingSafeEqual(a, b);
}

function createApi(baseUrl, internalSecret = '') {
  const request = async (path, { method = 'GET', body } = {}) => {
    const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
    if (internalSecret) headers['X-Hookroom-Internal'] = internalSecret;
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const message = data && typeof data === 'object' && data.error ? data.error : `HTTP ${response.status}`;
      throw new Error(message);
    }
    return data;
  };
  return { request };
}

function groupName(groups, groupId) {
  return groups.find((group) => group.id === groupId)?.name ?? '未分组';
}

function summarizeEndpoint(endpoint, groups, channels = []) {
  const channelIds = endpoint.channelIds ?? [];
  return {
    id: endpoint.id,
    name: endpoint.name,
    slug: endpoint.slug,
    path: `/hook/${endpoint.slug}`,
    description: endpoint.description || '',
    groupId: endpoint.groupId || '',
    group: groupName(groups, endpoint.groupId || ''),
    active: endpoint.active !== false,
    hasSecret: Boolean(endpoint.hasSecret),
    targetUrl: endpoint.targetUrl || '',
    channelIds,
    channels: channels
      .filter((channel) => channelIds.includes(channel.id))
      .map((channel) => ({
        id: channel.id,
        type: channel.type,
        name: channel.name,
        enabled: channel.enabled !== false,
      })),
  };
}

function previewBody(event) {
  const body = String(event.body ?? '').trim();
  if (!body) return '';
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const title = parsed.title || parsed.subject || parsed.name || '';
      const content = parsed.content || parsed.message || parsed.text || parsed.description || '';
      if (title || content) return `${title}${title && content ? '：' : ''}${content}`.slice(0, 240);
    }
  } catch {
    /* 非 JSON 直接截断 */
  }
  return body.replace(/\s+/g, ' ').slice(0, 240);
}

function summarizeEvent(event, endpoints, groups) {
  const endpoint = endpoints.find((item) => item.id === event.endpointId);
  const forwarding = Array.isArray(event.forwarding) ? event.forwarding : [];
  return {
    id: event.id,
    endpointId: event.endpointId,
    endpoint: endpoint?.name ?? '（已删除）',
    group: groupName(groups, endpoint?.groupId || ''),
    method: event.method,
    path: event.path,
    receivedAt: event.receivedAt,
    ip: event.ip || '',
    bodyBytes: event.bodyBytes ?? 0,
    signatureValid: event.signatureValid,
    preview: typeof event.preview === 'string' && event.preview ? event.preview : previewBody(event),
    forwarding: {
      attempted: forwarding.length,
      success: forwarding.filter((item) => item.success).length,
      failed: forwarding.filter((item) => !item.success).length,
    },
  };
}

function visibleGroupIds(access, state) {
  const ids = new Set(access.groupIds ?? []);
  for (const eventId of access.eventIds ?? []) {
    const event = (state.events ?? []).find((item) => item.id === eventId);
    const endpoint = state.endpoints.find((item) => item.id === event?.endpointId);
    if (endpoint?.groupId) ids.add(endpoint.groupId);
  }
  return ids;
}

function allowedEndpoint(access, endpoint, state) {
  if (access.all) return true;
  if (endpoint.groupId && access.groupIds.has(endpoint.groupId)) return true;
  if (access.eventIds.size && (state.events ?? []).some((event) => event.endpointId === endpoint.id && access.eventIds.has(event.id))) return true;
  return !endpoint.groupId && access.includeUngrouped;
}

function allowedEvent(access, event, state) {
  if (access.all) return true;
  if (access.eventIds.has(event.id)) return true;
  const endpoint = state.endpoints.find((item) => item.id === event.endpointId);
  return Boolean(endpoint && endpoint.groupId && access.groupIds.has(endpoint.groupId));
}

function canManageEndpoint(access, endpoint) {
  return access.all || Boolean(endpoint.groupId && access.groupIds.has(endpoint.groupId));
}

function requireWrite(access) {
  if (access.readOnly) throw new Error('该 MCP 密钥是只读密钥，不能执行写操作');
}

function requireAll(access) {
  if (!access.all) throw new Error('该操作需要全部权限的 MCP 密钥');
}

function allowedGroup(access, groupId) {
  return access.all || access.groupIds.has(groupId);
}

async function executeTool(name, args, api, access) {
  const input = args && typeof args === 'object' ? args : {};

  switch (name) {
    case 'list_groups': {
      const state = await api.request('/api/state');
      const visible = visibleGroupIds(access, state);
      const endpoints = state.endpoints.filter((endpoint) => allowedEndpoint(access, endpoint, state));
      const groups = (state.groups ?? [])
        .filter((group) => access.all || visible.has(group.id))
        .map((group) => ({
          id: group.id,
          name: group.name,
          createdAt: group.createdAt,
          endpointCount: endpoints.filter((endpoint) => endpoint.groupId === group.id).length,
        }));
      return {
        groups,
        ungroupedCount: endpoints.filter((endpoint) => !endpoint.groupId).length,
      };
    }

    case 'create_group': {
      requireWrite(access);
      requireAll(access);
      const state = await api.request('/api/state');
      const result = await api.request('/api/groups', {
        method: 'PUT',
        body: { groups: [...(state.groups ?? []), { name: String(input.name ?? '').trim() }] },
      });
      const created = result.groups.find((group) => group.name === String(input.name ?? '').trim());
      return { group: created, groups: result.groups };
    }

    case 'rename_group': {
      requireWrite(access);
      requireAll(access);
      const state = await api.request('/api/state');
      if (!(state.groups ?? []).some((group) => group.id === input.groupId)) throw new Error('分组不存在');
      const groups = state.groups.map((group) => (
        group.id === input.groupId ? { ...group, name: String(input.name ?? '').trim() } : group
      ));
      const result = await api.request('/api/groups', { method: 'PUT', body: { groups } });
      return { group: result.groups.find((group) => group.id === input.groupId), groups: result.groups };
    }

    case 'delete_group': {
      requireWrite(access);
      requireAll(access);
      const state = await api.request('/api/state');
      const groups = (state.groups ?? []).filter((group) => group.id !== input.groupId);
      const result = await api.request('/api/groups', { method: 'PUT', body: { groups } });
      return {
        deleted: input.groupId,
        groups: result.groups,
        endpoints: result.endpoints.map((endpoint) => summarizeEndpoint(endpoint, result.groups)),
      };
    }

    case 'list_endpoints': {
      const state = await api.request('/api/state');
      const groups = state.groups ?? [];
      const channels = state.channels ?? [];
      const endpoints = state.endpoints
        .filter((endpoint) => allowedEndpoint(access, endpoint, state))
        .filter((endpoint) => !input.groupId || endpoint.groupId === input.groupId)
        .map((endpoint) => summarizeEndpoint(endpoint, groups, channels));
      return { count: endpoints.length, endpoints, groups };
    }

    case 'create_endpoint': {
      requireWrite(access);
      const state = await api.request('/api/state');
      const groupId = input.groupId || '';
      if (!access.all && (!groupId || !allowedGroup(access, groupId))) {
        throw new Error('该密钥不能在这个分组下创建端点');
      }
      const endpoint = {
        name: input.name,
        slug: input.slug,
        description: input.description || '',
        targetUrl: input.targetUrl || '',
        groupId,
        active: true,
        channelIds: Array.isArray(input.channelIds) ? input.channelIds : [],
      };
      if (input.secret) endpoint.secret = input.secret;
      const result = await api.request('/api/endpoints', {
        method: 'PUT',
        body: { endpoints: [...state.endpoints, endpoint] },
      });
      const saved = result.endpoints.find((item) => item.slug === String(input.slug).toLowerCase());
      return { endpoint: saved ? summarizeEndpoint(saved, state.groups ?? [], state.channels ?? []) : null };
    }

    case 'update_endpoint': {
      requireWrite(access);
      const state = await api.request('/api/state');
      const index = state.endpoints.findIndex((endpoint) => endpoint.id === input.endpointId);
      if (index === -1) throw new Error('端点不存在');
      const existing = state.endpoints[index];
      if (!canManageEndpoint(access, existing)) throw new Error('没有权限操作这个端点');
      if (input.groupId !== undefined && !access.all && input.groupId && !allowedGroup(access, input.groupId)) {
        throw new Error('没有权限移动到该分组');
      }
      const updated = { ...existing };
      for (const key of ['name', 'slug', 'description', 'targetUrl', 'active']) {
        if (input[key] !== undefined) updated[key] = input[key];
      }
      if (input.groupId !== undefined) updated.groupId = input.groupId;
      if (input.channelIds !== undefined) updated.channelIds = input.channelIds;
      if (input.clearSecret) updated.secret = '';
      else if (input.secret) updated.secret = input.secret;

      const endpoints = [...state.endpoints];
      endpoints[index] = updated;
      const result = await api.request('/api/endpoints', { method: 'PUT', body: { endpoints } });
      const saved = result.endpoints.find((endpoint) => endpoint.id === existing.id);
      return { endpoint: summarizeEndpoint(saved, state.groups ?? [], state.channels ?? []) };
    }

    case 'delete_endpoint': {
      requireWrite(access);
      const state = await api.request('/api/state');
      const target = state.endpoints.find((endpoint) => endpoint.id === input.endpointId);
      if (!target) throw new Error('端点不存在');
      if (!canManageEndpoint(access, target)) throw new Error('没有权限删除这个端点');
      const endpoints = state.endpoints.filter((endpoint) => endpoint.id !== input.endpointId);
      await api.request('/api/endpoints', { method: 'PUT', body: { endpoints } });
      return { deleted: target.name, endpointId: target.id };
    }

    case 'set_endpoint_active': {
      requireWrite(access);
      const state = await api.request('/api/state');
      const target = state.endpoints.find((endpoint) => endpoint.id === input.endpointId);
      if (!target) throw new Error('端点不存在');
      if (!canManageEndpoint(access, target)) throw new Error('没有权限操作这个端点');
      const endpoints = state.endpoints.map((endpoint) => (
        endpoint.id === input.endpointId ? { ...endpoint, active: Boolean(input.active) } : endpoint
      ));
      const result = await api.request('/api/endpoints', { method: 'PUT', body: { endpoints } });
      const saved = result.endpoints.find((endpoint) => endpoint.id === input.endpointId);
      return { endpoint: summarizeEndpoint(saved, state.groups ?? [], state.channels ?? []) };
    }

    case 'list_notifications': {
      const state = await api.request('/api/state');
      const endpoints = state.endpoints;
      const groups = state.groups ?? [];
      const endpointId = input.endpointId || '';
      let events = (await api.request(`/api/events?limit=${Math.min(Math.max(Number(input.limit) || 20, 1), 100)}${endpointId ? `&endpointId=${encodeURIComponent(endpointId)}` : ''}`)).events ?? [];
      events = events.filter((event) => allowedEvent(access, event, state));
      if (input.groupId) {
        const ids = new Set(endpoints.filter((endpoint) => endpoint.groupId === input.groupId).map((endpoint) => endpoint.id));
        events = events.filter((event) => ids.has(event.endpointId));
      }
      if (input.method) events = events.filter((event) => event.method === String(input.method).toUpperCase());
      if (input.since) events = events.filter((event) => event.receivedAt >= input.since);
      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);
      return { count: events.length, notifications: events.slice(0, limit).map((event) => summarizeEvent(event, endpoints, groups)) };
    }

    case 'list_channels': {
      const state = await api.request('/api/state');
      return {
        channels: (state.channels ?? []).map((channel) => ({
          id: channel.id,
          type: channel.type,
          name: channel.name,
          enabled: channel.enabled !== false,
        })),
      };
    }

    case 'get_notification': {
      const state = await api.request('/api/state');
      const payload = await api.request(`/api/events/${encodeURIComponent(input.eventId)}`);
      const event = payload.event;
      if (!event) throw new Error('通知不存在');
      if (!allowedEvent(access, event, state)) throw new Error('没有权限查看这条通知');
      const endpoint = state.endpoints.find((item) => item.id === event.endpointId);
      return {
        notification: {
          ...event,
          body: String(event.body ?? '').slice(0, 8000),
          endpoint: endpoint?.name ?? '（已删除）',
          group: groupName(state.groups ?? [], endpoint?.groupId || ''),
        },
      };
    }

    case 'delete_notification': {
      requireWrite(access);
      const state = await api.request('/api/state');
      const eventPayload = await api.request(`/api/events/${encodeURIComponent(input.eventId)}`);
      const event = eventPayload.event;
      if (!event) throw new Error('通知不存在');
      if (!allowedEvent(access, event, state)) throw new Error('没有权限删除这条通知');
      await api.request(`/api/events/${encodeURIComponent(input.eventId)}`, { method: 'DELETE' });
      return { deleted: input.eventId };
    }

    case 'clear_notifications': {
      requireWrite(access);
      if (!access.all) {
        if (!input.endpointId) throw new Error('受限密钥不能清空全部通知，请指定端点');
        const state = await api.request('/api/state');
        const endpoint = state.endpoints.find((item) => item.id === input.endpointId);
        if (!endpoint || !canManageEndpoint(access, endpoint)) throw new Error('没有权限清空该端点');
      }
      const query = input.endpointId ? `?endpointId=${encodeURIComponent(input.endpointId)}` : '';
      const result = await api.request(`/api/events${query}`, { method: 'DELETE' });
      return result;
    }

    case 'resend_notification': {
      requireWrite(access);
      const state = await api.request('/api/state');
      const eventPayload = await api.request(`/api/events/${encodeURIComponent(input.eventId)}`);
      const event = eventPayload.event;
      if (!event) throw new Error('通知不存在');
      if (!allowedEvent(access, event, state)) throw new Error('没有权限重发这条通知');
      const result = await api.request(`/api/events/${encodeURIComponent(input.eventId)}/forward`, { method: 'POST' });
      return { forwarding: result.forwarding, notificationId: input.eventId };
    }

    case 'replay_notification': {
      requireWrite(access);
      const state = await api.request('/api/state');
      const eventPayload = await api.request(`/api/events/${encodeURIComponent(input.eventId)}`);
      const event = eventPayload.event;
      if (!event) throw new Error('通知不存在');
      if (!allowedEvent(access, event, state)) throw new Error('没有权限重放这条通知');
      const body = input.url ? { url: input.url } : {};
      const result = await api.request(`/api/events/${encodeURIComponent(input.eventId)}/replay`, {
        method: 'POST',
        body,
      });
      return result;
    }

    case 'send_test_notification': {
      requireWrite(access);
      const state = await api.request('/api/state');
      const endpoint = state.endpoints.find((item) => (
        (input.endpointId && item.id === input.endpointId)
        || (input.slug && item.slug === input.slug)
      ));
      if (!endpoint) throw new Error('端点不存在，请先 list_endpoints 获取');
      if (!canManageEndpoint(access, endpoint)) throw new Error('没有权限向这个端点发送测试');
      const response = await api.request(`/hook/${encodeURIComponent(endpoint.slug)}`, {
        method: 'POST',
        body: {
          title: input.title || 'Hookroom 测试通知',
          content: input.content || '这是一条由 MCP 工具发送的测试通知。',
          sentAt: new Date().toISOString(),
        },
      });
      return {
        endpoint: summarizeEndpoint(endpoint, state.groups ?? [], state.channels ?? []),
        response,
      };
    }

    case 'list_channel_types': {
      return api.request('/api/channel-types');
    }

    case 'get_stats': {
      const state = await api.request('/api/state');
      const endpoints = state.endpoints.filter((endpoint) => allowedEndpoint(access, endpoint, state));
      return {
        endpoints: endpoints.length,
        groups: (state.groups ?? []).filter((group) => allowedGroup(access, group.id)).length,
        storageMode: state.storageMode,
      };
    }

    default:
      throw new Error(`未知工具：${name}`);
  }
}

async function callTool(payload, api, access) {
  const name = payload.params?.name;
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) {
    return {
      jsonrpc: '2.0',
      id: payload.id ?? null,
      error: { code: -32602, message: `未知工具：${String(name)}` },
    };
  }
  try {
    const result = await executeTool(name, payload.params?.arguments ?? {}, api, access);
    return {
      jsonrpc: '2.0',
      id: payload.id ?? null,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: false,
      },
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: payload.id ?? null,
      result: {
        content: [{ type: 'text', text: error.message || String(error) }],
        isError: true,
      },
    };
  }
}

async function handleMessage(payload, api, access) {
  if (!payload || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string') {
    return {
      jsonrpc: '2.0',
      id: payload?.id ?? null,
      error: { code: -32600, message: 'Invalid Request' },
    };
  }

  const { method, id } = payload;
  if (id === undefined && method.startsWith('notifications/')) return null;

  if (method === 'initialize') {
    const requested = payload.params?.protocolVersion;
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      result: {
        protocolVersion: typeof requested === 'string' && requested ? requested : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Hookroom MCP：可以查看、管理 Webhook 端点与分组，查看通知消息，重发失败通知，以及发送测试请求。所有写操作都会直接影响线上配置。',
      },
    };
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id: id ?? null, result: {} };
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id: id ?? null, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    return callTool(payload, api, access);
  }

  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

function resolveAccess(provided, token, keys) {
  if (token && safeTokenEqual(provided, token)) {
    return {
      access: {
        all: true,
        groupIds: new Set(),
        eventIds: new Set(),
        readOnly: false,
        includeUngrouped: true,
      },
      keyId: null,
    };
  }

  const digest = hashToken(provided);
  const key = (keys ?? []).find((item) => (
    item.enabled !== false && item.hash && safeHashEqual(item.hash, digest)
  ));
  if (!key) return null;

  return {
    keyId: key.id,
    access: {
      all: !(key.groupIds ?? []).length && !(key.eventIds ?? []).length,
      groupIds: new Set(key.groupIds ?? []),
      eventIds: new Set(key.eventIds ?? []),
      readOnly: key.readOnly === true,
      includeUngrouped: false,
    },
  };
}

export async function handleMcp(request, { token, keys, baseUrl, internalSecret = '', onKeyUsed } = {}) {
  if (!token && !(keys ?? []).length) {
    return jsonResponse(503, { error: 'MCP 未启用：请先在工具中创建 MCP 密钥，或设置 MCP_TOKEN' });
  }
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }

  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  const provided = bearer || request.headers.get('x-mcp-token') || '';
  const resolved = provided ? resolveAccess(provided, token, keys) : null;
  if (!resolved) {
    return jsonResponse(401, { error: '未授权：MCP Token 无效' });
  }
  if (resolved.keyId && typeof onKeyUsed === 'function') {
    await Promise.resolve(onKeyUsed(resolved.keyId)).catch(() => {});
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }

  const origin = baseUrl || new URL(request.url).origin;
  const api = createApi(origin, internalSecret);

  if (Array.isArray(payload)) {
    const responses = [];
    for (const item of payload) {
      const response = await handleMessage(item, api, resolved.access);
      if (response) responses.push(response);
    }
    if (!responses.length) return new Response(null, { status: 202 });
    return jsonResponse(200, responses);
  }

  const response = await handleMessage(payload, api, resolved.access);
  if (!response) return new Response(null, { status: 202 });
  return jsonResponse(200, response);
}
