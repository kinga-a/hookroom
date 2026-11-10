import { getChannelDefinition } from './channel-catalog.js';
import { ALL_CHANNELS, errorMessage } from './notify-channels.js';

const SEND_TIMEOUT_MS = 4000;
const RETRY_DELAY_MS = 700;
const MAX_ATTEMPTS = 2;

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ success: false, channel: label, error: `发送超时（${ms / 1000} 秒）` }), ms);
    }),
  ]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildNotificationPayload(event, endpoint) {
  let parsed = null;
  if (event.body) {
    try {
      parsed = JSON.parse(event.body);
    } catch {
      parsed = null;
    }
  }

  let title = `${event.method} ${event.path}`;
  let content = '';

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    title = firstText(parsed.title, parsed.subject, parsed.event, parsed.name) || title;
    content = firstText(
      parsed.content,
      parsed.message,
      parsed.text,
      parsed.description,
      parsed.body,
      parsed.summary,
    );
    if (!content) content = String(event.body ?? '').slice(0, 1200);
  } else if (event.body) {
    content = String(event.body).slice(0, 1200);
  }

  if (!content) content = `收到一条 ${event.method} 请求（${event.path}），没有请求体。`;

  return {
    title: title.slice(0, 200),
    content: content.slice(0, 4000),
    metadata: {
      endpoint: endpoint.slug,
      endpointName: endpoint.name,
      eventId: event.id,
      method: event.method,
      path: event.path,
      receivedAt: event.receivedAt,
    },
  };
}

export async function sendToChannels(channels, payload) {
  const active = (channels ?? []).filter((channel) => channel.enabled !== false);
  if (!active.length) return [];

  const results = await Promise.all(active.map(async (channel) => {
    const definition = getChannelDefinition(channel.type);
    const impl = ALL_CHANNELS[channel.type];
    const started = Date.now();
    const base = {
      channelId: channel.id,
      type: channel.type,
      name: channel.name || definition?.label || channel.type,
      success: false,
      error: '',
      durationMs: 0,
    };

    if (!impl) {
      return { ...base, error: `未实现的通知渠道：${channel.type}`, durationMs: 0 };
    }

    let lastError = '发送失败';
    let attempts = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      attempts = attempt;
      try {
        const outcome = await withTimeout(impl.send(payload, channel.config ?? {}), SEND_TIMEOUT_MS, channel.type);
        if (outcome?.success) {
          return {
            ...base,
            success: true,
            error: '',
            attempts,
            durationMs: Date.now() - started,
          };
        }
        lastError = String(outcome?.error || '发送失败').slice(0, 300);
      } catch (error) {
        lastError = errorMessage(error).slice(0, 300);
      }
      if (attempt < MAX_ATTEMPTS) await delay(RETRY_DELAY_MS);
    }

    return {
      ...base,
      success: false,
      error: lastError,
      attempts,
      durationMs: Date.now() - started,
    };
  }));

  return results;
}
