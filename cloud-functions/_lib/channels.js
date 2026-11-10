import { randomBytes } from 'node:crypto';

import { getChannelDefinition } from './channel-catalog.js';
import { HttpError } from './errors.js';

export const MAX_CHANNELS = 8;

export function createChannelId() {
  return `ch_${randomBytes(8).toString('hex')}`;
}

function clean(value, max = 1000) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim().slice(0, max);
}

export function publicChannel(channel) {
  const definition = getChannelDefinition(channel.type);
  const config = {};
  const secretSet = [];
  for (const field of definition?.fields ?? []) {
    const value = channel.config?.[field.key];
    if (field.sensitive) {
      if (value) secretSet.push(field.key);
    } else if (value !== undefined) {
      config[field.key] = value;
    }
  }
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    enabled: channel.enabled !== false,
    config,
    secretSet,
  };
}

export function normalizeChannels(input, previousChannels = []) {
  if (input === undefined || input === null) return (previousChannels ?? []).map((channel) => ({
    ...channel,
    config: { ...(channel.config ?? {}) },
  }));
  if (!Array.isArray(input)) throw new HttpError(400, '通知渠道必须是数组');
  if (input.length > MAX_CHANNELS) throw new HttpError(400, `每个端点最多配置 ${MAX_CHANNELS} 个通知渠道`);

  const previousById = new Map((previousChannels ?? []).map((channel) => [channel.id, channel]));
  const usedIds = new Set();

  return input.map((item) => {
    if (!item || typeof item !== 'object') throw new HttpError(400, '通知渠道数据格式不正确');
    const definition = getChannelDefinition(item.type);
    if (!definition) throw new HttpError(400, `不支持的通知渠道类型：${String(item.type ?? '').slice(0, 40)}`);

    let id = typeof item.id === 'string' && /^ch_[a-z0-9]{6,32}$/.test(item.id) ? item.id : createChannelId();
    if (usedIds.has(id)) id = createChannelId();
    usedIds.add(id);

    const previous = previousById.get(id);
    const name = clean(item.name, 40) || definition.label;
    const inputConfig = item.config && typeof item.config === 'object' ? item.config : {};
    const config = {};

    for (const field of definition.fields) {
      const maxLength = field.type === 'textarea' ? 4000 : 1000;
      const rawValue = Object.prototype.hasOwnProperty.call(inputConfig, field.key)
        ? clean(inputConfig[field.key], maxLength)
        : undefined;
      const previousValue = previous?.config?.[field.key];

      if (field.sensitive) {
        if (rawValue) config[field.key] = rawValue;
        else if (previousValue) config[field.key] = previousValue;
      } else if (rawValue !== undefined) {
        config[field.key] = rawValue;
      } else if (previousValue !== undefined) {
        config[field.key] = previousValue;
      } else if (field.default !== undefined) {
        config[field.key] = field.default;
      }
    }

    for (const field of definition.fields) {
      if (field.required && !config[field.key]) {
        throw new HttpError(400, `渠道「${name}」缺少${field.label}`);
      }
    }

    return {
      id,
      type: definition.type,
      name,
      enabled: item.enabled !== false,
      config,
    };
  });
}
