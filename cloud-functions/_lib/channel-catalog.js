/**
 * 通知渠道定义：前端表单、后端校验与 API 共用。
 * 字段中的 sensitive: true 表示密钥类字段，API 不会回显，留空保存时保留原值。
 */
export const CHANNEL_TYPES = [
  {
    type: 'webhook',
    label: '自定义 Webhook',
    description: '把通知 JSON 推送到任意 HTTP 接口',
    fields: [
      { key: 'WEBHOOK_URL', label: '推送地址', type: 'url', required: true, placeholder: 'https://example.com/webhook' },
      { key: 'WEBHOOK_METHOD', label: '请求方法', type: 'select', default: 'POST', options: [{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }] },
      { key: 'WEBHOOK_HEADERS', label: '自定义请求头', type: 'textarea', placeholder: '{"Authorization":"Bearer xxx"}', help: 'JSON 对象，可选' },
      { key: 'WEBHOOK_TEMPLATE', label: '请求体模板', type: 'textarea', placeholder: '{"text":"{{title}}\\n{{content}}"}', help: '支持 {{title}}、{{content}}、{{timestamp}}、{{message}} 占位符' },
    ],
  },
  {
    type: 'telegram',
    label: 'Telegram',
    description: '通过 Bot 发送到私聊、群组或话题',
    fields: [
      { key: 'TG_BOT_TOKEN', label: 'Bot Token', type: 'password', required: true, sensitive: true, placeholder: '123456789:AA...' },
      { key: 'TG_CHAT_ID', label: 'Chat ID', required: true, placeholder: '-1001234567890' },
      { key: 'TG_TOPIC_ID', label: '话题 ID', placeholder: '论坛群组可选' },
    ],
  },
  {
    type: 'wechatbot',
    label: '企业微信群机器人',
    description: '发送 text 或 markdown 消息，可 @ 成员',
    fields: [
      { key: 'WECHATBOT_WEBHOOK', label: '机器人 Webhook', type: 'url', required: true, placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...' },
      { key: 'WECHATBOT_MSG_TYPE', label: '消息类型', type: 'select', default: 'text', options: [{ value: 'text', label: '纯文本' }, { value: 'markdown', label: 'Markdown' }] },
      { key: 'WECHATBOT_AT_MOBILES', label: '@ 手机号', placeholder: '多个手机号用逗号分隔' },
      { key: 'WECHATBOT_AT_ALL', label: '@ 所有人', type: 'select', default: 'false', options: [{ value: 'false', label: '否' }, { value: 'true', label: '是' }] },
    ],
  },
  {
    type: 'dingtalk',
    label: '钉钉机器人',
    description: '支持加签与 @ 成员',
    fields: [
      { key: 'DINGTALK_WEBHOOK', label: '机器人 Webhook', type: 'url', required: true, placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=...' },
      { key: 'DINGTALK_SECRET', label: '加签密钥', type: 'password', sensitive: true, placeholder: 'SEC...（可选）' },
      { key: 'DINGTALK_MSG_TYPE', label: '消息类型', type: 'select', default: 'text', options: [{ value: 'text', label: '纯文本' }, { value: 'markdown', label: 'Markdown' }] },
      { key: 'DINGTALK_AT_MOBILES', label: '@ 手机号', placeholder: '多个手机号用逗号分隔' },
      { key: 'DINGTALK_AT_ALL', label: '@ 所有人', type: 'select', default: 'false', options: [{ value: 'false', label: '否' }, { value: 'true', label: '是' }] },
    ],
  },
  {
    type: 'email',
    label: '邮件（Resend）',
    description: '通过 Resend API 发送邮件通知',
    fields: [
      { key: 'RESEND_API_KEY', label: 'Resend API Key', type: 'password', required: true, sensitive: true, placeholder: 're_...' },
      { key: 'EMAIL_FROM', label: '发件地址', type: 'email', required: true, placeholder: 'notify@example.com' },
      { key: 'EMAIL_FROM_NAME', label: '发件人名称', placeholder: 'Hookroom 通知' },
      { key: 'EMAIL_TO', label: '收件地址', type: 'email', required: true, placeholder: 'you@example.com' },
    ],
  },
  {
    type: 'smtp',
    label: '邮箱 SMTP',
    description: '用自己的邮箱 SMTP 账号发送邮件（QQ、163、Gmail、企业邮箱）',
    fields: [
      { key: 'SMTP_HOST', label: 'SMTP 服务器', required: true, placeholder: 'smtp.qq.com' },
      { key: 'SMTP_PORT', label: '端口', required: true, default: '465', placeholder: '465（SSL）或 587（STARTTLS）' },
      { key: 'SMTP_SECURE', label: '加密方式', type: 'select', default: 'true', options: [{ value: 'true', label: 'SSL/TLS（465）' }, { value: 'false', label: 'STARTTLS（587）' }] },
      { key: 'SMTP_USER', label: '登录账号', type: 'email', required: true, placeholder: 'you@qq.com' },
      { key: 'SMTP_PASS', label: '密码 / 授权码', type: 'password', required: true, sensitive: true, placeholder: '邮箱授权码，不是登录密码' },
      { key: 'SMTP_FROM', label: '发件地址', type: 'email', placeholder: '留空使用登录账号' },
      { key: 'SMTP_FROM_NAME', label: '发件人名称', placeholder: 'Hookroom 通知' },
      { key: 'SMTP_TO', label: '收件地址', type: 'email', required: true, placeholder: 'alerts@example.com，可用逗号分隔' },
    ],
  },
  {
    type: 'bark',
    label: 'Bark（iOS 推送）',
    description: '推送到 Bark App',
    fields: [
      { key: 'BARK_DEVICE_KEY', label: 'Device Key', type: 'password', sensitive: true, placeholder: '标准 Bark 服务需要' },
      { key: 'BARK_SERVER', label: '服务地址', default: 'https://api.day.app', placeholder: 'https://api.day.app' },
      { key: 'BARK_IS_ARCHIVE', label: '自动保存', type: 'select', default: 'false', options: [{ value: 'false', label: '否' }, { value: 'true', label: '是' }] },
    ],
  },
  {
    type: 'gotify',
    label: 'Gotify',
    description: '自托管 Gotify 消息推送',
    fields: [
      { key: 'GOTIFY_SERVER_URL', label: '服务地址', type: 'url', required: true, placeholder: 'https://gotify.example.com' },
      { key: 'GOTIFY_APP_TOKEN', label: 'App Token', type: 'password', required: true, sensitive: true },
    ],
  },
  {
    type: 'serverchan',
    label: 'Server酱',
    description: '通过 SendKey 推送到微信',
    fields: [
      { key: 'SERVERCHAN_SENDKEY', label: 'SendKey', type: 'password', required: true, sensitive: true, placeholder: 'SCT...' },
    ],
  },
  {
    type: 'pushplus',
    label: 'PushPlus',
    description: '推送到微信服务号',
    fields: [
      { key: 'PUSHPLUS_TOKEN', label: 'Token', type: 'password', required: true, sensitive: true },
      { key: 'PUSHPLUS_TOPIC', label: '群组编码', placeholder: '可选' },
      { key: 'PUSHPLUS_CHANNEL', label: '渠道', placeholder: '例如 wechat / webhook' },
    ],
  },
  {
    type: 'ntfy',
    label: 'ntfy',
    description: '通过 ntfy 主题推送',
    fields: [
      { key: 'NTFY_TOPIC', label: 'Topic', required: true, placeholder: 'hookroom-alerts' },
      { key: 'NTFY_SERVER', label: '服务地址', default: 'https://ntfy.sh', placeholder: 'https://ntfy.sh' },
      { key: 'NTFY_TOKEN', label: '访问 Token', type: 'password', sensitive: true, placeholder: '可选' },
    ],
  },
  {
    type: 'notifyx',
    label: 'NotifyX',
    description: 'NotifyX 消息推送',
    fields: [
      { key: 'NOTIFYX_API_KEY', label: 'API Key', type: 'password', required: true, sensitive: true },
    ],
  },
  {
    type: 'wpush',
    label: 'WPush',
    description: 'WPush 消息推送',
    fields: [
      { key: 'WPUSH_APIKEY', label: 'API Key', type: 'password', required: true, sensitive: true },
      { key: 'WPUSH_CHANNEL', label: '渠道', placeholder: '可选' },
      { key: 'WPUSH_TOPIC_CODE', label: 'Topic Code', placeholder: '可选' },
    ],
  },
];

export const CHANNEL_TYPE_MAP = new Map(CHANNEL_TYPES.map((item) => [item.type, item]));

export function getChannelDefinition(type) {
  return CHANNEL_TYPE_MAP.get(type) ?? null;
}

export function publicChannelCatalog() {
  return CHANNEL_TYPES;
}
