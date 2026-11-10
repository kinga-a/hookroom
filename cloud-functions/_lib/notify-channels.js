import nodemailer from 'nodemailer';

import { assertSafeOutboundUrl } from './url-guard.js';

/**
 * notify-channels.js
 * 从 worker_1793709985976_gdpjzz.js 提取的独立通知模块
 *
 * 支持 12 个通知渠道：
 *   telegram, notifyx, webhook, wechatbot, email, bark,
 *   gotify, serverchan, pushplus, ntfy, wpush, dingtalk
 *
 * 用法：
 *   import { dispatch, sendNotificationToAllChannels, ALL_CHANNELS } from './notify-channels.js';
 *
 *   const config = {
 *     ENABLED_NOTIFIERS: ['telegram', 'bark'],
 *     TG_BOT_TOKEN: 'xxx',
 *     TG_CHAT_ID: 'xxx',
 *     BARK_DEVICE_KEY: 'xxx',
 *   };
 *
 *   const result = await dispatch({ title: '标题', content: '内容' }, config);
 *   // => { attempted: 2, successCount: 1, failedCount: 1, results: [...], channelResults: { telegram: true, bark: false } }
 */

// ============================================================================
// 通用工具函数
// ============================================================================

function escapeMarkdownV2(text = '') {
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function stripMarkdown(text = '') {
  return String(text).replace(/(\*\*|\*|##|#|`)/g, '');
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ok(name, raw) {
  return { success: true, channel: name, raw };
}

function fail(name, error, raw) {
  return { success: false, channel: name, error, raw };
}

function errorMessage(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return String(err.message);
  try { return JSON.stringify(err); } catch { return String(err); }
}

// ============================================================================
// 1. Telegram
//    配置: TG_BOT_TOKEN, TG_CHAT_ID, TG_TOPIC_ID(可选, 论坛话题ID)
//    API:  POST https://api.telegram.org/bot{TOKEN}/sendMessage
// ============================================================================
const telegramChannel = {
  name: 'telegram',
  validateConfig(config) {
    if (!config.TG_BOT_TOKEN) return { ok: false, error: '缺少 TG_BOT_TOKEN' };
    if (!config.TG_CHAT_ID) return { ok: false, error: '缺少 TG_CHAT_ID' };
    return { ok: true };
  },
  async send(payload, config) {
    const v = telegramChannel.validateConfig(config);
    if (!v.ok) return fail('telegram', v.error || '配置无效');
    const url = `https://api.telegram.org/bot${config.TG_BOT_TOKEN}/sendMessage`;
    const fullText = payload.title ? `*${payload.title}*\n\n${payload.content}` : String(payload.content || '');
    const escaped = escapeMarkdownV2(fullText);
    const body = { chat_id: config.TG_CHAT_ID, text: escaped, parse_mode: 'MarkdownV2' };
    const topicId = config.TG_TOPIC_ID ? Number(config.TG_TOPIC_ID) : undefined;
    if (Number.isFinite(topicId) && topicId > 0) body.message_thread_id = Math.floor(topicId);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (result.ok) return ok('telegram', result);
      // MarkdownV2 解析失败时降级为纯文本
      if (result.description && /parse entities/i.test(result.description)) {
        const body2 = { ...body, text: fullText };
        delete body2.parse_mode;
        const r2 = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body2),
        });
        const result2 = await r2.json();
        return result2.ok ? ok('telegram', result2) : fail('telegram', `Telegram 拒绝: ${result2.description || '未知'}`, result2);
      }
      return fail('telegram', `Telegram 拒绝: ${result.description || '未知'}`, result);
    } catch (err) {
      return fail('telegram', errorMessage(err));
    }
  },
  async test(config) {
    return telegramChannel.send(
      { title: '测试通知', content: '这是一条来自通知系统的测试消息。' },
      config,
    );
  },
};

// ============================================================================
// 2. NotifyX
//    配置: NOTIFYX_API_KEY
//    API:  POST https://www.notifyx.cn/api/v1/send/{API_KEY}
// ============================================================================
const notifyxChannel = {
  name: 'notifyx',
  validateConfig(config) {
    if (!config.NOTIFYX_API_KEY) return { ok: false, error: '缺少 NOTIFYX_API_KEY' };
    return { ok: true };
  },
  async send(payload, config) {
    const v = notifyxChannel.validateConfig(config);
    if (!v.ok) return fail('notifyx', v.error || '配置无效');
    const url = `https://www.notifyx.cn/api/v1/send/${config.NOTIFYX_API_KEY}`;
    const body = JSON.stringify({
      title: payload.title || '订阅提醒',
      content: `## ${payload.title || '订阅提醒'}\n\n${payload.content || ''}`,
      description: '订阅提醒',
    });
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const result = await r.json();
      return result.status === 'queued' ? ok('notifyx', result) : fail('notifyx', `NotifyX 返回 ${result.status || 'unknown'}`, result);
    } catch (err) {
      return fail('notifyx', errorMessage(err));
    }
  },
  async test(config) {
    return notifyxChannel.send(
      { title: '测试通知', content: '这是一条 NotifyX 测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 3. Webhook（自定义 HTTP 回调）
//    配置: WEBHOOK_URL, WEBHOOK_METHOD(可选, 默认POST),
//          WEBHOOK_HEADERS(可选, JSON字符串), WEBHOOK_TEMPLATE(可选, JSON模板)
//    模板占位符: {{title}} {{content}} {{timestamp}} {{message}} 等
// ============================================================================
const webhookChannel = {
  name: 'webhook',
  validateConfig(config) {
    if (!config.WEBHOOK_URL) return { ok: false, error: '缺少 WEBHOOK_URL' };
    return { ok: true };
  },
  async send(payload, config) {
    const v = webhookChannel.validateConfig(config);
    if (!v.ok) return fail('webhook', v.error || '配置无效');
    try {
      await assertSafeOutboundUrl(config.WEBHOOK_URL, { label: 'Webhook 地址' });
    } catch (error) {
      return fail('webhook', error.message);
    }
    let headers = { 'Content-Type': 'application/json' };
    if (config.WEBHOOK_HEADERS) {
      try {
        headers = { ...headers, ...JSON.parse(config.WEBHOOK_HEADERS) };
      } catch {
        console.warn('[Webhook] 自定义请求头格式错误，使用默认请求头');
      }
    }
    const data = {
      title: payload.title,
      content: payload.content,
      timestamp: new Date().toISOString(),
      message: `${payload.title}\n\n${payload.content}`,
      ...payload.metadata,
    };
    let requestBody;
    if (config.WEBHOOK_TEMPLATE) {
      try {
        const template = JSON.parse(config.WEBHOOK_TEMPLATE);
        const templateString = JSON.stringify(template);
        const replaced = templateString.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            return JSON.stringify(String(data[key])).slice(1, -1);
          }
          return '';
        });
        requestBody = JSON.parse(replaced);
      } catch {
        requestBody = { ...data };
      }
    } else {
      requestBody = { ...data };
    }
    try {
      const r = await fetch(config.WEBHOOK_URL, {
        method: config.WEBHOOK_METHOD || 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
      const text = await r.text().catch(() => '');
      return r.ok ? ok('webhook', text) : fail('webhook', `HTTP ${r.status}`, text);
    } catch (err) {
      return fail('webhook', errorMessage(err));
    }
  },
  async test(config) {
    return webhookChannel.send(
      { title: '测试通知', content: '这是一条 Webhook 测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 4. 企业微信机器人 (WeChat Bot)
//    配置: WECHATBOT_WEBHOOK, WECHATBOT_MSG_TYPE(text|markdown),
//          WECHATBOT_AT_MOBILES(逗号分隔手机号), WECHATBOT_AT_ALL(true|false)
// ============================================================================
const wecomChannel = {
  name: 'wechatbot',
  validateConfig(config) {
    if (!config.WECHATBOT_WEBHOOK) return { ok: false, error: '缺少 WECHATBOT_WEBHOOK' };
    return { ok: true };
  },
  async send(payload, config) {
    const v = wecomChannel.validateConfig(config);
    if (!v.ok) return fail('wechatbot', v.error || '配置无效');
    const msgType = config.WECHATBOT_MSG_TYPE || 'text';
    let messageData;
    if (msgType === 'markdown') {
      messageData = { msgtype: 'markdown', markdown: { content: `# ${payload.title}\n\n${payload.content}` } };
    } else {
      messageData = { msgtype: 'text', text: { content: `${payload.title}\n\n${stripMarkdown(payload.content)}` } };
    }
    if (config.WECHATBOT_AT_ALL === 'true' && msgType === 'text') {
      messageData.text.mentioned_list = ['@all'];
    } else if (config.WECHATBOT_AT_MOBILES) {
      const mobiles = String(config.WECHATBOT_AT_MOBILES).split(',').map(m => m.trim()).filter(Boolean);
      if (mobiles.length > 0 && msgType === 'text') {
        messageData.text.mentioned_mobile_list = mobiles;
      }
    }
    try {
      const r = await fetch(config.WECHATBOT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageData),
      });
      const text = await r.text();
      if (!r.ok) return fail('wechatbot', `HTTP ${r.status}`, text);
      let result;
      try { result = JSON.parse(text); } catch { return fail('wechatbot', '响应非 JSON', text); }
      return result.errcode === 0 ? ok('wechatbot', result) : fail('wechatbot', `企业微信返回 errcode=${result.errcode} ${result.errmsg || ''}`, result);
    } catch (err) {
      return fail('wechatbot', errorMessage(err));
    }
  },
  async test(config) {
    return wecomChannel.send(
      { title: '测试通知', content: '这是一条企业微信测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 5. Email (Resend)
//    配置: RESEND_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME(可选), EMAIL_TO
//    API:  POST https://api.resend.com/emails
// ============================================================================
const emailChannel = {
  name: 'email',
  validateConfig(config) {
    if (!config.RESEND_API_KEY) return { ok: false, error: '缺少 RESEND_API_KEY' };
    if (!config.EMAIL_FROM) return { ok: false, error: '缺少 EMAIL_FROM' };
    if (!config.EMAIL_TO) return { ok: false, error: '缺少 EMAIL_TO' };
    return { ok: true };
  },
  async send(payload, config) {
    const v = emailChannel.validateConfig(config);
    if (!v.ok) return fail('email', v.error || '配置无效');
    const fromEmail = config.EMAIL_FROM_NAME ? `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM}>` : config.EMAIL_FROM;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: config.EMAIL_TO,
          subject: payload.title,
          html: `<h2>${payload.title}</h2><div>${stripMarkdown(payload.content)}</div>`,
          text: stripMarkdown(payload.content),
        }),
      });
      const result = await r.json().catch(() => ({}));
      return r.ok && result && result.id ? ok('email', result) : fail('email', result?.message || `HTTP ${r.status}`, result);
    } catch (err) {
      return fail('email', errorMessage(err));
    }
  },
  async test(config) {
    return emailChannel.send(
      { title: '测试通知', content: '这是一条邮件测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 6. Bark (iOS 推送)
//    配置: BARK_DEVICE_KEY, BARK_SERVER(默认 https://api.day.app),
//          BARK_IS_ARCHIVE(true|false)
// ============================================================================
const barkChannel = {
  name: 'bark',
  validateConfig(config) {
    if (!config.BARK_SERVER && !config.BARK_DEVICE_KEY) {
      return { ok: false, error: '缺少 BARK_DEVICE_KEY 或 BARK_SERVER' };
    }
    return { ok: true };
  },
  async send(payload, config) {
    const v = barkChannel.validateConfig(config);
    if (!v.ok) return fail('bark', v.error || '配置无效');
    const serverUrl = (config.BARK_SERVER || 'https://api.day.app').replace(/\/+$/, '');
    let url, headers = { 'Content-Type': 'application/json; charset=utf-8' }, body;
    try {
      const parsed = new URL(serverUrl);
      const isCustomUrl = parsed.pathname && parsed.pathname !== '/';
      if (parsed.username) {
        const credentials = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password || '')}`;
        headers['Authorization'] = `Basic ${btoa(credentials)}`;
        parsed.username = '';
        parsed.password = '';
      }
      if (isCustomUrl) {
        url = parsed.href.replace(/\/+$/, '');
        body = { title: payload.title, body: stripMarkdown(payload.content) };
      } else {
        if (!config.BARK_DEVICE_KEY) return fail('bark', '标准 Bark API 缺少 BARK_DEVICE_KEY');
        url = `${parsed.href.replace(/\/+$/, '')}/push`;
        body = { title: payload.title, body: stripMarkdown(payload.content), device_key: config.BARK_DEVICE_KEY };
      }
    } catch {
      return fail('bark', `BARK_SERVER 不是合法 URL: ${serverUrl}`);
    }
    if (config.BARK_IS_ARCHIVE === 'true') body.isArchive = 1;
    try {
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const result = await r.json().catch(() => ({}));
      return result && result.code === 200 ? ok('bark', result) : fail('bark', `Bark 返回 code=${result?.code}`, result);
    } catch (err) {
      return fail('bark', errorMessage(err));
    }
  },
  async test(config) {
    return barkChannel.send(
      { title: '测试通知', content: '这是一条 Bark 测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 7. Gotify
//    配置: GOTIFY_SERVER_URL, GOTIFY_APP_TOKEN
//    API:  POST {SERVER_URL}/message?token={APP_TOKEN}
// ============================================================================
const gotifyChannel = {
  name: 'gotify',
  validateConfig(config) {
    if (!config.GOTIFY_SERVER_URL) return { ok: false, error: '缺少 GOTIFY_SERVER_URL' };
    if (!config.GOTIFY_APP_TOKEN) return { ok: false, error: '缺少 GOTIFY_APP_TOKEN' };
    return { ok: true };
  },
  async send(payload, config) {
    const v = gotifyChannel.validateConfig(config);
    if (!v.ok) return fail('gotify', v.error || '配置无效');
    const url = String(config.GOTIFY_SERVER_URL).replace(/\/+$/, '') + '/message?token=' + encodeURIComponent(String(config.GOTIFY_APP_TOKEN));
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.title || '通知',
          message: stripMarkdown(payload.content) || '',
          priority: 5,
        }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return fail('gotify', `HTTP ${r.status}`, text);
      }
      return ok('gotify');
    } catch (err) {
      return fail('gotify', errorMessage(err));
    }
  },
  async test(config) {
    return gotifyChannel.send(
      { title: '测试通知', content: '这是一条 Gotify 测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 8. Server酱
//    配置: SERVERCHAN_SENDKEY
//    API:  POST https://sctapi.ftqq.com/{SENDKEY}.send
// ============================================================================
const serverChanChannel = {
  name: 'serverchan',
  validateConfig(config) {
    if (!config.SERVERCHAN_SENDKEY) return { ok: false, error: '缺少 SERVERCHAN_SENDKEY' };
    return { ok: true };
  },
  async send(payload, config) {
    const v = serverChanChannel.validateConfig(config);
    if (!v.ok) return fail('serverchan', v.error || '配置无效');
    const endpoint = `https://sctapi.ftqq.com/${config.SERVERCHAN_SENDKEY}.send`;
    const body = new URLSearchParams({
      title: payload.title || '订阅提醒',
      desp: `## ${payload.title || '订阅提醒'}\n\n${payload.content || ''}`,
    });
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const result = await r.json().catch(() => ({}));
      return result && result.code === 0 ? ok('serverchan', result) : fail('serverchan', `Server酱返回 code=${result?.code} ${result?.message || ''}`, result);
    } catch (err) {
      return fail('serverchan', errorMessage(err));
    }
  },
  async test(config) {
    return serverChanChannel.send(
      { title: '测试通知', content: '这是一条 Server酱 测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 9. PushPlus
//    配置: PUSHPLUS_TOKEN, PUSHPLUS_TOPIC(可选), PUSHPLUS_CHANNEL(可选)
//    API:  POST https://www.pushplus.plus/send
// ============================================================================
const pushplusChannel = {
  name: 'pushplus',
  validateConfig(config) {
    if (!config.PUSHPLUS_TOKEN) return { ok: false, error: '缺少 PUSHPLUS_TOKEN' };
    return { ok: true };
  },
  async send(payload, config) {
    const v = pushplusChannel.validateConfig(config);
    if (!v.ok) return fail('pushplus', v.error || '配置无效');
    const body = {
      token: config.PUSHPLUS_TOKEN,
      title: payload.title || '订阅提醒',
      content: `## ${payload.title || '订阅提醒'}\n\n${payload.content || ''}`,
      template: 'markdown',
    };
    if (config.PUSHPLUS_TOPIC) body.topic = config.PUSHPLUS_TOPIC;
    if (config.PUSHPLUS_CHANNEL) body.channel = config.PUSHPLUS_CHANNEL;
    try {
      const r = await fetch('https://www.pushplus.plus/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await r.json().catch(() => ({}));
      return result && result.code === 200 ? ok('pushplus', result) : fail('pushplus', `PushPlus 返回 code=${result?.code} ${result?.msg || ''}`, result);
    } catch (err) {
      return fail('pushplus', errorMessage(err));
    }
  },
  async test(config) {
    return pushplusChannel.send(
      { title: '测试通知', content: '这是一条 PushPlus 测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 10. ntfy
//     配置: NTFY_TOPIC, NTFY_SERVER(可选, 默认 https://ntfy.sh), NTFY_TOKEN(可选)
//     API:  POST {SERVER}/{TOPIC}
// ============================================================================
const ntfyChannel = {
  name: 'ntfy',
  validateConfig(config) {
    if (!config.NTFY_TOPIC || !String(config.NTFY_TOPIC).trim()) {
      return { ok: false, error: '缺少 NTFY_TOPIC' };
    }
    return { ok: true };
  },
  async send(payload, config) {
    const v = ntfyChannel.validateConfig(config);
    if (!v.ok) return fail('ntfy', v.error || '配置无效');
    const server = String(config.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
    const topic = String(config.NTFY_TOPIC).trim().replace(/^\/+/, '');
    const url = `${server}/${encodeURIComponent(topic)}`;
    const headers = {
      Title: payload.title || '订阅提醒',
      'Content-Type': 'text/plain; charset=utf-8',
    };
    const token = config.NTFY_TOKEN ? String(config.NTFY_TOKEN).trim() : '';
    if (token) {
      headers.Authorization = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
    }
    const body = stripMarkdown(payload.content || '') || (payload.title || '通知');
    try {
      const r = await fetch(url, { method: 'POST', headers, body });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return fail('ntfy', `HTTP ${r.status}`, text);
      }
      const raw = await r.json().catch(() => ({}));
      return ok('ntfy', raw);
    } catch (err) {
      return fail('ntfy', errorMessage(err));
    }
  },
  async test(config) {
    return ntfyChannel.send(
      { title: '测试通知', content: '这是一条 ntfy 测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 11. WPush
//     配置: WPUSH_APIKEY, WPUSH_CHANNEL(可选), WPUSH_TOPIC_CODE(可选)
//     API:  POST https://api.wpush.cn/api/v1/send
// ============================================================================
const wpushChannel = {
  name: 'wpush',
  validateConfig(config) {
    if (!config.WPUSH_APIKEY || !String(config.WPUSH_APIKEY).trim()) {
      return { ok: false, error: '缺少 WPUSH_APIKEY' };
    }
    return { ok: true };
  },
  async send(payload, config) {
    const v = wpushChannel.validateConfig(config);
    if (!v.ok) return fail('wpush', v.error || '配置无效');
    const body = {
      apikey: String(config.WPUSH_APIKEY).trim(),
      title: payload.title || '订阅提醒',
      content: payload.content || payload.title || '订阅提醒',
    };
    if (config.WPUSH_CHANNEL && String(config.WPUSH_CHANNEL).trim()) {
      body.channel = String(config.WPUSH_CHANNEL).trim();
    }
    if (config.WPUSH_TOPIC_CODE && String(config.WPUSH_TOPIC_CODE).trim()) {
      body.topic_code = String(config.WPUSH_TOPIC_CODE).trim();
    }
    try {
      const r = await fetch('https://api.wpush.cn/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await r.json().catch(() => ({}));
      const responseCode = typeof result?.code === 'number' ? result.code : null;
      return r.ok && responseCode === 0 ? ok('wpush', { httpStatus: r.status, code: responseCode }) : fail('wpush', `WPUSH 返回 HTTP ${r.status}，code=${responseCode ?? '未知'}`, { httpStatus: r.status, code: responseCode });
    } catch (err) {
      return fail('wpush', errorMessage(err));
    }
  },
  async test(config) {
    return wpushChannel.send(
      { title: '测试通知', content: '这是一条 WPUSH 测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 12. 钉钉机器人 (DingTalk)
//     配置: DINGTALK_WEBHOOK, DINGTALK_SECRET(可选, 加签),
//           DINGTALK_MSG_TYPE(text|markdown), DINGTALK_AT_MOBILES(逗号分隔),
//           DINGTALK_AT_ALL(true|false)
// ============================================================================
async function computeDingTalkSign(timestamp, secret) {
  const encoder = new TextEncoder();
  const stringToSign = `${timestamp}\n${secret}`;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(stringToSign));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const dingtalkChannel = {
  name: 'dingtalk',
  validateConfig(config) {
    if (!config.DINGTALK_WEBHOOK) return { ok: false, error: '缺少 DINGTALK_WEBHOOK' };
    return { ok: true };
  },
  async send(payload, config) {
    const v = dingtalkChannel.validateConfig(config);
    if (!v.ok) return fail('dingtalk', v.error || '配置无效');
    const msgType = config.DINGTALK_MSG_TYPE || 'text';
    let messageData;
    if (msgType === 'markdown') {
      messageData = {
        msgtype: 'markdown',
        markdown: { title: payload.title, text: `# ${payload.title}\n\n${payload.content}` },
      };
    } else {
      messageData = {
        msgtype: 'text',
        text: { content: `${payload.title}\n\n${payload.content}` },
      };
    }
    if (config.DINGTALK_AT_ALL === 'true') {
      messageData.at = { isAtAll: true };
    } else if (config.DINGTALK_AT_MOBILES) {
      const mobiles = String(config.DINGTALK_AT_MOBILES).split(/[,，\s]+/).map(m => m.trim()).filter(m => m.length > 0);
      if (mobiles.length > 0) {
        messageData.at = { atMobiles: mobiles };
      }
    }
    let webhookUrl = config.DINGTALK_WEBHOOK;
    if (config.DINGTALK_SECRET) {
      const timestamp = Date.now();
      const sign = await computeDingTalkSign(timestamp, config.DINGTALK_SECRET);
      const separator = webhookUrl.includes('?') ? '&' : '?';
      webhookUrl = `${webhookUrl}${separator}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
    }
    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageData),
      });
      const text = await r.text().catch(() => '');
      if (!r.ok) return fail('dingtalk', `HTTP ${r.status}`, text);
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { return ok('dingtalk', text); }
      if (parsed.errcode === 0) return ok('dingtalk', parsed);
      return fail('dingtalk', parsed.errmsg || `钉钉错误码 ${parsed.errcode}`, parsed);
    } catch (err) {
      return fail('dingtalk', errorMessage(err));
    }
  },
  async test(config) {
    return dingtalkChannel.send(
      { title: '测试通知', content: '这是一条钉钉测试通知，用于验证加签与消息格式。' },
      config,
    );
  },
};

// ============================================================================
// 13. 邮箱 SMTP（QQ / 163 / Gmail / 企业邮箱）
//     配置: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
//           SMTP_FROM, SMTP_FROM_NAME, SMTP_TO
// ============================================================================
const smtpChannel = {
  name: 'smtp',
  validateConfig(config) {
    if (!config.SMTP_HOST) return { ok: false, error: '缺少 SMTP_HOST' };
    if (!config.SMTP_USER) return { ok: false, error: '缺少 SMTP_USER' };
    if (!config.SMTP_PASS) return { ok: false, error: '缺少 SMTP_PASS' };
    if (!config.SMTP_TO) return { ok: false, error: '缺少 SMTP_TO' };
    const port = Number(config.SMTP_PORT || 465);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { ok: false, error: 'SMTP_PORT 不是合法端口' };
    }
    return { ok: true };
  },
  async send(payload, config) {
    const v = smtpChannel.validateConfig(config);
    if (!v.ok) return fail('smtp', v.error || '配置无效');

    const port = Number(config.SMTP_PORT || 465);
    const secure = String(config.SMTP_SECURE ?? 'true') !== 'false';
    const fromAddress = config.SMTP_FROM || config.SMTP_USER;
    const from = config.SMTP_FROM_NAME ? `${config.SMTP_FROM_NAME} <${fromAddress}>` : fromAddress;
    const title = String(payload.title || 'Hookroom 通知').replace(/[\r\n]+/g, ' ').slice(0, 200);
    const text = stripMarkdown(payload.content || '').slice(0, 4000);
    const html = `<h2>${escapeHtml(title)}</h2><div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
    let transporter;

    try {
      transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port,
        secure,
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
        connectionTimeout: 3500,
        greetingTimeout: 3500,
        socketTimeout: 4000,
      });
      const info = await transporter.sendMail({
        from,
        to: config.SMTP_TO,
        subject: title,
        text,
        html,
      });
      return ok('smtp', { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
    } catch (err) {
      return fail('smtp', errorMessage(err));
    } finally {
      try {
        transporter?.close?.();
      } catch {
        /* 忽略关闭连接失败 */
      }
    }
  },
  async test(config) {
    return smtpChannel.send(
      { title: '测试通知', content: '这是一条 SMTP 邮件测试通知。' },
      config,
    );
  },
};

// ============================================================================
// 渠道注册表
// ============================================================================
const ALL_CHANNELS = {
  telegram: telegramChannel,
  notifyx: notifyxChannel,
  webhook: webhookChannel,
  wechatbot: wecomChannel,
  email: emailChannel,
  bark: barkChannel,
  gotify: gotifyChannel,
  serverchan: serverChanChannel,
  pushplus: pushplusChannel,
  ntfy: ntfyChannel,
  wpush: wpushChannel,
  dingtalk: dingtalkChannel,
  smtp: smtpChannel,
};

// ============================================================================
// dispatch - 向所有已启用渠道并行发送通知
//
// 参数:
//   payload  - { title, content, metadata? }
//   config   - 包含 ENABLED_NOTIFIERS 数组及各渠道配置字段
//   options  - { logPrefix?, onLog?(logEntry) }
//
// 返回:
//   { attempted, successCount, failedCount, results, channelResults }
// ============================================================================
async function dispatch(payload, config, options = {}) {
  const enabled = Array.isArray(config.ENABLED_NOTIFIERS) ? config.ENABLED_NOTIFIERS : [];
  const prefix = options.logPrefix || '[notify]';
  const channels = enabled.map(name => ALL_CHANNELS[name]).filter(ch => ch != null);
  if (channels.length === 0) {
    console.log(`${prefix} 未启用任何通知渠道`);
    return { attempted: 0, successCount: 0, failedCount: 0, results: [], channelResults: {} };
  }
  const settled = await Promise.allSettled(
    channels.map(ch =>
      ch.send({ ...payload, metadata: options.metadata }, config).catch(err => ({
        success: false,
        channel: ch.name,
        error: err && err.message ? err.message : String(err),
      }))
    )
  );
  const results = settled.map((r, idx) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      success: false,
      channel: channels[idx].name,
      error: r.reason && r.reason.message ? r.reason.message : String(r.reason),
    };
  });
  const channelResults = {};
  let successCount = 0;
  let failedCount = 0;
  for (const r of results) {
    channelResults[r.channel] = r.success;
    if (r.success) {
      successCount++;
      console.log(`${prefix} ${r.channel} 发送成功`);
    } else {
      failedCount++;
      console.log(`${prefix} ${r.channel} 发送失败: ${r.error}`);
    }
    // 可选：写日志回调
    if (options.onLog) {
      try {
        options.onLog({
          channel: r.channel,
          status: r.success ? 'success' : 'failed',
          title: payload.title,
          content: payload.content,
          error: r.error,
          raw: r.raw,
        });
      } catch (err) {
        console.warn(`${prefix} 写通知日志失败:`, err);
      }
    }
  }
  return { attempted: results.length, successCount, failedCount, results, channelResults };
}

// ============================================================================
// sendNotificationToAllChannels - 便捷封装
//
// 参数:
//   title, content - 通知标题和内容
//   config         - 渠道配置
//   logPrefix      - 日志前缀（可选）
//   options        - { env?, subId?, ruleId?, metadata?, onLog? }
//
// 返回:
//   { attempted, successCount, failedCount, channelResults }
// ============================================================================
async function sendNotificationToAllChannels(title, content, config, logPrefix = '[通知]', options = {}) {
  const result = await dispatch(
    { title, content },
    config,
    {
      logPrefix,
      metadata: options.metadata,
      onLog: options.onLog,
    }
  );
  return {
    attempted: result.attempted,
    successCount: result.successCount,
    failedCount: result.failedCount,
    channelResults: result.channelResults,
  };
}

// ============================================================================
// handleThirdPartyNotify - 第三方推送 API 处理函数
//
// 用于在 Cloudflare Worker / Express 等服务端中处理外部推送请求。
// 需要先在 config 中设置 THIRD_PARTY_API_TOKEN 才能使用。
//
// 参数:
//   request - Request 对象（需有 .method, .headers, .json()）
//   config  - 渠道配置（含 THIRD_PARTY_API_TOKEN）
//   tokenFromPath / tokenFromHeader / tokenFromQuery - 认证令牌（任一即可）
//
// 返回:
//   Response 对象（已认证则发送通知并返回结果；未认证返回 401/403）
//   或 null（路径不匹配 / 非 POST 请求，交给后续路由处理）
// ============================================================================
async function handleThirdPartyNotify(request, config, { tokenFromPath = '', tokenFromHeader = '', tokenFromQuery = '' } = {}) {
  const providedToken = tokenFromPath || tokenFromHeader || tokenFromQuery;
  const expectedToken = config.THIRD_PARTY_API_TOKEN || '';
  if (!expectedToken) {
    return new Response(
      JSON.stringify({ message: '第三方 API 已禁用，请配置访问令牌后使用' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (!providedToken || providedToken !== expectedToken) {
    return new Response(
      JSON.stringify({ message: '访问未授权，令牌无效或缺失' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (request.method !== 'POST') return null;
  try {
    const body = await request.json();
    const title = body.title || '第三方通知';
    const content = body.content || '';
    if (!content) {
      return new Response(
        JSON.stringify({ message: '缺少必填参数 content' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const bodyTagsRaw = Array.isArray(body.tags) ? body.tags : typeof body.tags === 'string' ? body.tags.split(/[,，\s]+/) : [];
    const bodyTags = Array.isArray(bodyTagsRaw) ? bodyTagsRaw.filter(tag => typeof tag === 'string' && tag.trim().length > 0).map(tag => tag.trim()) : [];
    await sendNotificationToAllChannels(title, content, config, '[第三方API]', {
      metadata: { tags: bodyTags },
    });
    return new Response(
      JSON.stringify({
        message: '发送成功',
        response: { errcode: 0, errmsg: 'ok', msgid: 'MSGID' + Date.now() },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[第三方API] 发送通知失败:', error);
    return new Response(
      JSON.stringify({
        message: '发送失败',
        response: { errcode: 1, errmsg: error.message },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================================
// 导出
// ============================================================================
export {
  // 渠道实例
  telegramChannel,
  notifyxChannel,
  webhookChannel,
  wecomChannel,
  emailChannel,
  barkChannel,
  gotifyChannel,
  serverChanChannel,
  pushplusChannel,
  ntfyChannel,
  wpushChannel,
  dingtalkChannel,
  smtpChannel,
  // 渠道注册表
  ALL_CHANNELS,
  // 核心函数
  dispatch,
  sendNotificationToAllChannels,
  handleThirdPartyNotify,
  // 工具函数
  escapeMarkdownV2,
  stripMarkdown,
  ok,
  fail,
  errorMessage,
};
