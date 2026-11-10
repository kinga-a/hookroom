export function seedState() {
  const now = Date.now();
  const iso = (offsetMs) => new Date(now - offsetMs).toISOString();

  const deploy = {
    id: 'ep_9c41d7a2b6e0',
    slug: 'deploy-notify',
    name: '部署通知',
    description: 'CI 流水线完成后推送构建结果',
    targetUrl: '',
    active: true,
    createdAt: iso(1000 * 60 * 60 * 26),
    secret: '',
    channelIds: [],
    groupId: '',
  };
  const leads = {
    id: 'ep_3f8b21c4d9a7',
    slug: 'form-lead',
    name: '表单意向',
    description: '官网合作表单提交',
    targetUrl: '',
    active: true,
    createdAt: iso(1000 * 60 * 60 * 7),
    secret: '',
    channelIds: [],
    groupId: '',
  };

  const events = [
    {
      id: 'evt_seed_1',
      endpointId: leads.id,
      slug: leads.slug,
      method: 'POST',
      path: `/hook/${leads.slug}`,
      query: { source: 'pricing-page' },
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'x-signature': 'sha256=8f2c…a91d',
      },
      body: JSON.stringify({
        company: '青禾餐饮集团',
        contact: 'lin@qinghe-food.cn',
        seats: 42,
        note: '希望两周内完成试点接入',
      }, null, 2),
      bodyBytes: 118,
      truncated: false,
      contentType: 'application/json',
      ip: '113.87.42.16',
      receivedAt: iso(1000 * 60 * 42),
      replayOf: null,
      signatureValid: null,
    },
    {
      id: 'evt_seed_2',
      endpointId: deploy.id,
      slug: deploy.slug,
      method: 'POST',
      path: `/hook/${deploy.slug}`,
      query: {},
      headers: {
        'content-type': 'application/json',
        'user-agent': 'GitHub-Hookshot/9a1c4f',
        'x-github-event': 'deployment_status',
      },
      body: JSON.stringify({
        service: 'checkout-api',
        environment: 'production',
        commit: 'a13f9c2',
        status: 'success',
        duration_s: 74,
      }, null, 2),
      bodyBytes: 136,
      truncated: false,
      contentType: 'application/json',
      ip: '140.82.115.7',
      receivedAt: iso(1000 * 60 * 60 * 3 + 1000 * 60 * 11),
      replayOf: null,
      signatureValid: null,
    },
    {
      id: 'evt_seed_3',
      endpointId: deploy.id,
      slug: deploy.slug,
      method: 'GET',
      path: `/hook/${deploy.slug}`,
      query: { probe: '1' },
      headers: { 'user-agent': 'curl/8.7.1' },
      body: '',
      bodyBytes: 0,
      truncated: false,
      contentType: '',
      ip: '113.87.42.16',
      receivedAt: iso(1000 * 60 * 60 * 8),
      replayOf: null,
      signatureValid: null,
    },
  ];

  return {
    version: 2,
    groups: [],
    channels: [],
    endpoints: [deploy, leads],
    events,
    apiKeys: [],
    auth: null,
    backup: { webdav: { url: '', username: '', password: '', path: 'hookroom-backup.json' } },
  };
}
