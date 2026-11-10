import { randomBytes } from 'node:crypto';

import { HttpError } from './errors.js';
import { isBlockedAddress } from './url-guard.js';

import { normalizeGroups } from './groups.js';

export const MAX_EVENTS = 500;
export const MAX_ENDPOINTS = 50;
export const MAX_STORED_BODY = 32 * 1024;
export const MAX_TOTAL_EVENT_BYTES = 4 * 1024 * 1024;

export { HttpError } from './errors.js';
export { normalizeGroups, MAX_GROUPS } from './groups.js';

export function createId(prefix) {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug);
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function validateEndpoint(input, takenSlugs = new Set(), groupIds = new Set(), channelIds = new Set()) {
  if (!input || typeof input !== 'object') throw new HttpError(400, '端点数据格式不正确');

  const name = cleanText(input.name, 40);
  if (!name) throw new HttpError(400, '端点名称不能为空');

  const slug = cleanText(input.slug, 40).toLowerCase();
  if (!isValidSlug(slug)) throw new HttpError(400, '接收路径只能包含小写字母、数字和中划线（2–40 位）');
  if (takenSlugs.has(slug)) throw new HttpError(409, `接收路径 /hook/${slug} 已被占用`);

  let secret;
  if (Object.prototype.hasOwnProperty.call(input, 'secret')) {
    if (typeof input.secret !== 'string') throw new HttpError(400, '签名密钥格式不正确');
    secret = input.secret.trim().slice(0, 200);
  }

  const targetUrl = cleanText(input.targetUrl, 500);
  if (targetUrl) {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new HttpError(400, '转发地址不是合法的 URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new HttpError(400, '转发地址只支持 http 或 https');
    }
  }

  const endpoint = {
    id: typeof input.id === 'string' && /^ep_[a-z0-9]{6,32}$/.test(input.id) ? input.id : createId('ep'),
    slug,
    name,
    description: cleanText(input.description, 160),
    targetUrl,
    active: input.active !== false,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
    groupId: groupIds.has(typeof input.groupId === 'string' ? input.groupId : '') ? input.groupId : '',
    channelIds: Array.isArray(input.channelIds)
      ? [...new Set(input.channelIds.filter((id) => typeof id === 'string' && channelIds.has(id)))]
      : [],
  };
  if (secret !== undefined) endpoint.secret = secret;
  return endpoint;
}

export function validateEndpointList(list, previousEndpoints = [], groupIds = new Set(), channelIds = new Set()) {
  if (!Array.isArray(list)) throw new HttpError(400, '端点列表必须是数组');
  if (list.length > MAX_ENDPOINTS) throw new HttpError(400, `最多只能配置 ${MAX_ENDPOINTS} 个接收端点`);
  const slugs = new Set();
  const ids = new Set();
  return list.map((item) => {
    const previous = previousEndpoints.find((endpoint) => (
      (typeof item?.id === 'string' && endpoint.id === item.id)
      || (typeof item?.slug === 'string' && endpoint.slug === item.slug.trim().toLowerCase())
    )) ?? null;
    const mergedItem = {
      ...item,
      groupId: Object.prototype.hasOwnProperty.call(item ?? {}, 'groupId')
        ? item.groupId
        : (previous?.groupId ?? ''),
      channelIds: Object.prototype.hasOwnProperty.call(item ?? {}, 'channelIds')
        ? item.channelIds
        : (previous?.channelIds ?? []),
    };
    const endpoint = validateEndpoint(mergedItem, slugs, groupIds, channelIds);
    if (ids.has(endpoint.id)) throw new HttpError(400, '端点 ID 重复');
    slugs.add(endpoint.slug);
    ids.add(endpoint.id);
    return endpoint;
  });
}

export function mergeEndpointSecrets(list, previous) {
  const previousBySlug = new Map(previous.map((endpoint) => [endpoint.slug, endpoint]));
  const claimedIds = new Set();
  return list.map((endpoint) => {
    const byId = previous.find((item) => item.id === endpoint.id && !claimedIds.has(item.id));
    const bySlug = previousBySlug.get(endpoint.slug);
    const existing = byId ?? (bySlug && !claimedIds.has(bySlug.id) ? bySlug : null);
    if (!existing) {
      return endpoint.secret === undefined ? { ...endpoint, secret: '' } : endpoint;
    }
    claimedIds.add(existing.id);
    return {
      ...endpoint,
      id: existing.id,
      createdAt: existing.createdAt,
      secret: endpoint.secret !== undefined ? endpoint.secret : (existing.secret ?? ''),
    };
  });
}

export function estimateEventBytes(event) {
  return Buffer.byteLength(event.body ?? '', 'utf8')
    + Buffer.byteLength(JSON.stringify(event.headers ?? {}), 'utf8')
    + 512;
}

export function trimEvents(events) {
  const trimmed = events.slice(0, MAX_EVENTS);
  let totalBytes = trimmed.reduce((sum, event) => sum + estimateEventBytes(event), 0);
  while (trimmed.length > 1 && totalBytes > MAX_TOTAL_EVENT_BYTES) {
    const dropped = trimmed.pop();
    totalBytes -= estimateEventBytes(dropped);
  }
  return trimmed;
}

export function buildStats(state, summaries = null, counters = null) {
  const today = new Date().toISOString().slice(0, 10);
  const events = Array.isArray(summaries) ? summaries : (Array.isArray(state.events) ? state.events : []);
  return {
    total: counters ? Number(counters.total) || 0 : events.length,
    today: counters
      ? Number(counters.today) || 0
      : events.filter((event) => String(event.receivedAt).slice(0, 10) === today).length,
    activeEndpoints: state.endpoints.filter((endpoint) => endpoint.active).length,
    endpointCount: state.endpoints.length,
  };
}

function previewText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/* 与前端 extractPreview 保持一致的列表预览，摘要接口直接复用这份结果 */
export function extractEventPreview(event) {
  const raw = String(event?.body ?? '').trim();
  if (!raw) return '';
  const contentType = String(event?.contentType ?? '').toLowerCase();

  if (contentType.includes('x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    const pairs = [...params.entries()].map(([key, value]) => `${key}：${value}`);
    if (pairs.length) return pairs.join(' · ').slice(0, 240);
  }

  const looksJson = /json/i.test(contentType) || /^[[{]/.test(raw);
  if (looksJson) {
    try {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const pick = (keys) => {
          for (const key of keys) {
            const value = previewText(data[key]);
            if (value) return value;
          }
          return '';
        };
        const title = pick(['title', 'subject', 'name', 'event', 'type']);
        const content = pick(['content', 'text', 'message', 'description', 'summary', 'note', 'body']);
        if (title && content) {
          return (content.includes(title) ? content : `${title}：${content}`).slice(0, 240);
        }
        if (content) return content.slice(0, 240);
        if (title) return title.slice(0, 240);
        const strings = Object.values(data).map((value) => previewText(value)).filter(Boolean).slice(0, 3);
        if (strings.length) return strings.join(' · ').slice(0, 240);
        return `JSON 数据 · ${Object.keys(data).length} 个字段`;
      }
      if (Array.isArray(data)) {
        const strings = data.map((value) => previewText(value)).filter(Boolean).slice(0, 3);
        return strings.length ? strings.join(' · ').slice(0, 240) : `JSON 数组 · ${data.length} 项`;
      }
    } catch {
      /* 被截断或非标准 JSON 时按纯文本处理 */
    }
  }

  return raw.replace(/\s+/g, ' ').slice(0, 240);
}
