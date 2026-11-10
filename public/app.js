const STORAGE_ENDPOINTS = 'hookroom:endpoints:v1';
const VIEW_MODE_KEY = 'hookroom:viewMode:v2';
const COMPACT_PAGE_KEY = 'hookroom:compactPageSize:v1';
const TIMEZONE_KEY = 'hookroom:timezone:v1';
const TIMEZONE_OPTIONS = [
  { value: 'local', label: '浏览器本地时区（默认）' },
  { value: 'Asia/Shanghai', label: '中国标准时间 UTC+8' },
  { value: 'Asia/Tokyo', label: '日本时间 UTC+9' },
  { value: 'Asia/Singapore', label: '新加坡时间 UTC+8' },
  { value: 'Europe/London', label: '英国时间' },
  { value: 'America/New_York', label: '美国东部时间' },
  { value: 'UTC', label: 'UTC' },
];
const MAX_EVENTS = 500;

const ICONS = {
  grip: `<svg viewBox="0 0 10 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.1"/><circle cx="7" cy="3" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="7" cy="8" r="1.1"/><circle cx="3" cy="13" r="1.1"/><circle cx="7" cy="13" r="1.1"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.6 6.4 3 3"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M9 5.5v13M15 5.5v13"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 5.8 18 12l-9.5 6.2V5.8Z"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.2A2.2 2.2 0 0 0 4 5.2v6.3A2.5 2.5 0 0 0 6.5 14"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15M9.5 7V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6a1.7 1.7 0 0 1 1.7 1.7V7"/><path d="M6.5 7 7.4 19a1.8 1.8 0 0 0 1.8 1.6h5.6A1.8 1.8 0 0 0 16.6 19L17.5 7"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5V9H15"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2.4"/><path d="M8.5 10V7.6a3.5 3.5 0 0 1 7 0V10"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.6"/><path d="m4 4 16 16"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>`,
};

const state = {
  endpoints: [],
  events: [],
  stats: { total: 0, today: 0 },
  selectedId: 'all',
  method: '',
  detailId: null,
  editingId: null,
  newIds: new Set(),
  storageMode: 'local',
  realtime: true,
  channelTypes: [],
  channels: [],
  draftChannelIds: [],
  editingChannelId: null,
  groups: [],
  editingGroupId: null,
  apiKeys: [],
  auth: { enabled: false },
  authInfo: null,
  backupSettings: {},
  toolsTab: 'keys',
  editingApiKeyId: null,
  totpSetup: null,
  viewMode: 'compact',
  compactPageSize: 10,
  compactExpandedId: null,
  compactPages: {},
  timezone: 'local',
};

const dom = {};
let dragState = null;
let suppressClick = false;
let lastFocused = null;
let scrimTimer = null;
let clearArmTimer = null;
let endpointSyncTimer = null;
let lastSyncErrorAt = 0;
let toastTimer = null;
let secretCleared = false;
let pollTimer = null;
let pollBusy = false;
let streamSource = null;
let streamErrors = 0;

const numberFormatter = new Intl.NumberFormat('zh-CN');
const zonedFormatterCache = new Map();

/* ── 启动 ────────────────────────────────────────────── */

async function boot() {
  cacheDom();
  bindEvents();
  initDrag();
  state.viewMode = readViewMode();
  state.compactPageSize = readCompactPageSize();
  state.timezone = readTimezone();

  const local = readLocalEndpoints();
  let reachable = true;

  try {
    const authInfo = await fetch('/api/auth/status', { cache: 'no-store' })
      .then((response) => response.json())
      .catch(() => null);
    state.authInfo = authInfo;
    if (authInfo?.enabled && !authInfo.authenticated) {
      showLogin(authInfo);
      return;
    }
  } catch {
    /* 继续尝试加载数据 */
  }

  try {
    const [statePayload, eventsPayload, channelPayload] = await Promise.all([
      api('/api/state'),
      api('/api/events?limit=500'),
      api('/api/channel-types').catch(() => ({ types: [] })),
    ]);
    state.channelTypes = Array.isArray(channelPayload?.types) ? channelPayload.types : [];
    state.groups = Array.isArray(statePayload.groups) ? statePayload.groups : [];
    state.channels = Array.isArray(statePayload.channels) ? statePayload.channels : [];
    state.apiKeys = Array.isArray(statePayload.apiKeys) ? statePayload.apiKeys : [];
    state.auth = statePayload.auth ?? { enabled: false };
    state.backupSettings = statePayload.backup ?? {};

    const serverEndpoints = Array.isArray(statePayload.endpoints) ? statePayload.endpoints : [];
    state.storageMode = statePayload.storageMode === 'cloud' ? 'cloud' : 'local';
    state.realtime = statePayload.realtime !== false;

    if (state.storageMode === 'cloud') {
      state.endpoints = serverEndpoints;
      writeLocalEndpoints();
    } else if (local.found) {
      state.endpoints = local.list;
      if (!sameEndpoints(local.list, serverEndpoints)) {
        const synced = await api('/api/endpoints', { method: 'PUT', body: { endpoints: local.list } });
        state.endpoints = Array.isArray(synced.endpoints) ? synced.endpoints : local.list;
      }
    } else {
      state.endpoints = serverEndpoints;
      writeLocalEndpoints();
    }

    state.events = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
    state.stats.total = Number(statePayload.stats?.total ?? state.events.length);
    recountToday();
  } catch (error) {
    reachable = false;
    state.endpoints = local.found ? local.list : [];
    state.events = [];
    state.stats.total = 0;
    state.realtime = false;
    state.channelTypes = [];
    state.groups = [];
    state.channels = [];
    state.apiKeys = [];
    state.auth = { enabled: false };
    state.backupSettings = {};
    recountToday();
    toast(`无法连接服务：${error.message}`, 'error', 5200);
  }

  if (state.selectedId !== 'all' && !state.endpoints.some((item) => item.id === state.selectedId)) {
    state.selectedId = 'all';
  }

  renderStorageMode();
  renderAll();
  applyViewMode();

  if (reachable) startUpdates();
  else setLive('offline');
}

function cacheDom() {
  const byId = (id) => document.getElementById(id);
  dom.endpointList = byId('endpointList');
  dom.endpointCount = byId('endpointCount');
  dom.orderStatus = byId('orderStatus');
  dom.addEndpointBtn = byId('addEndpointBtn');
  dom.addGroupBtn = byId('addGroupBtn');
  dom.restoreSamplesBtn = byId('restoreSamplesBtn');
  dom.storageNote = byId('storageNote');
  dom.feed = document.querySelector('.feed');
  dom.detailWorkspace = byId('detailWorkspace');
  dom.compactView = byId('compactView');
  dom.compactList = byId('compactList');
  dom.compactCount = byId('compactCount');
  dom.feedEyebrow = byId('feedEyebrow');
  dom.feedTitle = byId('feedTitle');
  dom.hookLine = byId('hookLine');
  dom.hookUrl = byId('hookUrl');
  dom.copyEndpointUrl = byId('copyEndpointUrl');
  dom.viewAllBtn = byId('viewAllBtn');
  dom.clearEventsBtn = byId('clearEventsBtn');
  dom.filters = document.querySelector('.filters');
  dom.visibleCount = byId('visibleCount');
  dom.eventList = byId('eventList');
  dom.emptyState = byId('emptyState');
  dom.emptyTitle = byId('emptyTitle');
  dom.emptyText = byId('emptyText');
  dom.emptyCurlBtn = byId('emptyCurlBtn');
  dom.streamStatus = byId('streamStatus');
  dom.statTotal = document.querySelector('[data-stat="total"]');
  dom.statToday = document.querySelector('[data-stat="today"]');
  dom.statActive = document.querySelector('[data-stat="active"]');
  dom.scrim = byId('scrim');
  dom.detailPanel = byId('detailPanel');
  dom.detailMethod = byId('detailMethod');
  dom.detailPath = byId('detailPath');
  dom.detailSub = byId('detailSub');
  dom.detailBody = byId('detailBody');
  dom.closeDetailBtn = byId('closeDetailBtn');
  dom.endpointDialog = byId('endpointDialog');
  dom.endpointForm = byId('endpointForm');
  dom.dialogTitle = byId('dialogTitle');
  dom.fieldName = byId('fieldName');
  dom.fieldSlug = byId('fieldSlug');
  dom.fieldGroup = byId('fieldGroup');
  dom.fieldDescription = byId('fieldDescription');
  dom.fieldTarget = byId('fieldTarget');
  dom.fieldSecret = byId('fieldSecret');
  dom.toggleSecretBtn = byId('toggleSecretBtn');
  dom.generateSecretBtn = byId('generateSecretBtn');
  dom.manageChannelsBtn = byId('manageChannelsBtn');
  dom.endpointChannelList = byId('endpointChannelList');
  dom.channelDialog = byId('channelDialog');
  dom.channelForm = byId('channelForm');
  dom.channelDialogTitle = byId('channelDialogTitle');
  dom.channelType = byId('channelType');
  dom.channelTypeHelp = byId('channelTypeHelp');
  dom.channelName = byId('channelName');
  dom.channelFields = byId('channelFields');
  dom.channelEnabled = byId('channelEnabled');
  dom.channelSaveBtn = byId('channelSaveBtn');
  dom.groupDialog = byId('groupDialog');
  dom.groupForm = byId('groupForm');
  dom.groupDialogTitle = byId('groupDialogTitle');
  dom.groupName = byId('groupName');
  dom.groupError = byId('groupError');
  dom.groupSaveBtn = byId('groupSaveBtn');
  dom.openToolsBtn = byId('openToolsBtn');
  dom.toolsDialog = byId('toolsDialog');
  dom.toolsBody = byId('toolsBody');
  dom.apiKeyDialog = byId('apiKeyDialog');
  dom.apiKeyForm = byId('apiKeyForm');
  dom.apiKeyDialogTitle = byId('apiKeyDialogTitle');
  dom.apiKeyName = byId('apiKeyName');
  dom.apiKeyNote = byId('apiKeyNote');
  dom.apiKeyScopeFields = byId('apiKeyScopeFields');
  dom.apiKeyGroups = byId('apiKeyGroups');
  dom.apiKeyEvents = byId('apiKeyEvents');
  dom.apiKeyReadOnly = byId('apiKeyReadOnly');
  dom.apiKeyError = byId('apiKeyError');
  dom.apiKeySaveBtn = byId('apiKeySaveBtn');
  dom.revealKeyDialog = byId('revealKeyDialog');
  dom.revealKeySecret = byId('revealKeySecret');
  dom.copyRevealKeyBtn = byId('copyRevealKeyBtn');
  dom.loginScreen = byId('loginScreen');
  dom.loginForm = byId('loginForm');
  dom.loginUsername = byId('loginUsername');
  dom.loginPassword = byId('loginPassword');
  dom.loginTotp = byId('loginTotp');
  dom.loginTotpField = byId('loginTotpField');
  dom.loginError = byId('loginError');
  dom.nameError = byId('nameError');
  dom.slugError = byId('slugError');
  dom.targetError = byId('targetError');
  dom.secretError = byId('secretError');
  dom.secretHelp = byId('secretHelp');
  dom.clearSecretBtn = byId('clearSecretBtn');
  dom.deleteEndpointBtn = byId('deleteEndpointBtn');
  dom.curlDialog = byId('curlDialog');
  dom.curlCode = byId('curlCode');
  dom.copyCurlBtn = byId('copyCurlBtn');
  dom.openCurlBtn = byId('openCurlBtn');
  dom.toast = byId('toast');
  dom.toastText = byId('toastText');
  dom.liveStatus = byId('liveStatus');
  dom.liveLabel = dom.liveStatus.querySelector('.live-label');
}

/* ── 本地存储 ────────────────────────────────────────── */

function readLocalEndpoints() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_ENDPOINTS);
  } catch {
    return { found: false, list: [] };
  }
  if (raw === null) return { found: false, list: [] };
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || !data.every(isEndpointLike)) return { found: false, list: [] };
    return { found: true, list: data };
  } catch {
    return { found: false, list: [] };
  }
}

function isEndpointLike(item) {
  return Boolean(
    item
    && typeof item === 'object'
    && /^ep_[a-z0-9]{6,32}$/.test(String(item.id))
    && /^[a-z0-9][a-z0-9-]{1,39}$/.test(String(item.slug))
    && typeof item.name === 'string'
    && item.name.trim().length > 0,
  );
}

function writeLocalEndpoints() {
  try {
    localStorage.setItem(STORAGE_ENDPOINTS, JSON.stringify(state.endpoints));
  } catch {
    /* 隐私模式下可能不可写，界面不因此中断 */
  }
}

function sameEndpoints(a, b) {
  const channelSignature = (channels) => (channels ?? []).map((channel) => [
    channel.id,
    channel.type,
    channel.name,
    channel.enabled !== false,
    channel.config ?? {},
    channel.secretSet ?? [],
  ]);
  const signature = (list) => JSON.stringify(list.map((item) => [
    item.id, item.slug, item.name, item.description ?? '', item.targetUrl ?? '', item.active !== false,
    item.groupId ?? '', (item.channelIds ?? []).slice().sort(),
  ]));
  return signature(a) === signature(b);
}

/* ── 服务端通信 ──────────────────────────────────────── */

async function api(pathname, { method = 'GET', body } = {}) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(pathname, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && payload.authRequired) {
      showLoginFromStatus();
    }
    throw new Error(payload.error || `请求失败（${response.status}）`);
  }
  return payload;
}

function persistEndpoints({ immediate = false } = {}) {
  writeLocalEndpoints();
  if (immediate) {
    if (endpointSyncTimer) clearTimeout(endpointSyncTimer);
    endpointSyncTimer = null;
    return syncEndpoints();
  }
  if (endpointSyncTimer) clearTimeout(endpointSyncTimer);
  endpointSyncTimer = setTimeout(() => {
    endpointSyncTimer = null;
    syncEndpoints();
  }, 320);
  return Promise.resolve();
}

async function syncEndpoints() {
  try {
    const payload = await api('/api/endpoints', { method: 'PUT', body: { endpoints: state.endpoints } });
    if (Array.isArray(payload.endpoints)) state.endpoints = payload.endpoints;
    writeLocalEndpoints();
  } catch (error) {
    if (Date.now() - lastSyncErrorAt > 4000) {
      lastSyncErrorAt = Date.now();
      toast('配置已保存在浏览器，但同步到 Node 服务失败', 'error', 4200);
    }
  }
}

function startUpdates() {
  if (state.realtime) connectStream();
  else startPolling();
}

function connectStream() {
  if (!('EventSource' in window)) {
    startPolling();
    return;
  }
  streamSource?.close();
  const source = new EventSource('/api/stream');
  streamSource = source;
  source.addEventListener('open', () => {
    streamErrors = 0;
    setLive('online');
  });
  source.addEventListener('error', () => {
    streamErrors += 1;
    setLive('offline');
    if (streamErrors >= 3) {
      source.close();
      if (streamSource === source) streamSource = null;
      startPolling();
    }
  });
  source.addEventListener('ready', (event) => {
    const payload = safeParse(event.data);
    const total = Number(payload?.stats?.total);
    if (Number.isFinite(total) && total > state.stats.total) {
      state.stats.total = total;
      renderStats();
    }
  });
  source.addEventListener('event-updated', (event) => {
    const payload = safeParse(event.data);
    const updated = payload?.event;
    if (!updated?.id) return;
    const index = state.events.findIndex((item) => item.id === updated.id);
    if (index !== -1) state.events.splice(index, 1, updated);
    if (state.detailId === updated.id) renderDetail(updated);
    renderEvents();
  });
  source.addEventListener('request', (event) => {
    const payload = safeParse(event.data);
    const incoming = payload?.event;
    if (!incoming?.id) return;
    if (state.events.some((item) => item.id === incoming.id)) return;

    state.events.unshift(incoming);
    if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
    state.stats.total += 1;
    if (isToday(incoming.receivedAt)) state.stats.today += 1;
    state.newIds.add(incoming.id);

    renderStats();
    if (!dragState) renderEndpoints();
    renderEvents();

    notifyIfOffscreen(incoming);
    const endpoint = state.endpoints.find((item) => item.id === incoming.endpointId);
    announce(`${incoming.method} 请求到达 ${incoming.path}${endpoint ? `，端点 ${endpoint.name}` : ''}`);
  });
}

function notifyIfOffscreen(incoming) {
  const endpoint = state.endpoints.find((item) => item.id === incoming.endpointId);
  const inView = (state.selectedId === 'all' || incoming.endpointId === state.selectedId)
    && (!state.method || incoming.method === state.method);
  if (!inView && !document.hidden) {
    toast(`「${endpoint?.name ?? '其他端点'}」收到一条 ${incoming.method} 请求`, 'neutral', 3800);
  }
}

function startPolling() {
  if (pollTimer) return;
  state.realtime = false;
  setLive('polling');
  pollEvents();
  pollTimer = setInterval(() => {
    if (!document.hidden) pollEvents();
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && pollTimer) pollEvents();
  });
}

async function pollEvents() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const params = new URLSearchParams({ limit: '50' });
    const latest = state.events[0]?.receivedAt;
    if (latest) params.set('since', latest);
    const payload = await api(`/api/events?${params.toString()}`);
    const incoming = (payload.events ?? []).filter(
      (event) => event?.id && !state.events.some((item) => item.id === event.id),
    );

    if (incoming.length) {
      incoming.forEach((event) => state.newIds.add(event.id));
      const seen = new Set();
      state.events = [...incoming, ...state.events]
        .filter((event) => {
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          return true;
        })
        .slice(0, MAX_EVENTS);
      state.stats.total = Number(payload.stats?.total ?? state.stats.total + incoming.length);
      recountToday();
      renderStats();
      if (!dragState) renderEndpoints();
      renderEvents();
      notifyIfOffscreen(incoming[0]);
    } else if (payload.stats) {
      state.stats.total = Math.max(state.stats.total, Number(payload.stats.total) || 0);
      renderStats();
    }
    setLive('polling');
  } catch {
    setLive('offline');
  } finally {
    pollBusy = false;
  }
}

function setLive(mode) {
  dom.liveStatus.dataset.state = mode;
  dom.liveLabel.textContent = mode === 'online'
    ? '实时连接'
    : mode === 'polling'
      ? '轮询同步'
      : mode === 'offline'
        ? '正在重连'
        : '连接中';
  dom.liveStatus.title = mode === 'online'
    ? 'Server-Sent Events 已连接'
    : mode === 'polling'
      ? 'EdgeOne 环境每 5 秒轮询一次新请求'
      : '实时连接已断开，正在尝试恢复';
}

function renderStorageMode() {
  if (!dom.storageNote) return;
  if (state.storageMode === 'cloud') {
    dom.storageNote.textContent = '云端共享：端点、排序与签名密钥保存在 EdgeOne Blob，同一站点的访问者共用这套配置。';
  }
}

/* ── 渲染 ────────────────────────────────────────────── */

function renderAll() {
  renderEndpoints();
  renderHeader();
  renderStats();
  updateFilters();
  renderEvents();
}

function currentEndpoint() {
  return state.endpoints.find((item) => item.id === state.selectedId) ?? null;
}

function renderEndpoints() {
  dom.endpointList.innerHTML = '';
  dom.endpointCount.textContent = String(state.endpoints.length);
  dom.addGroupBtn.disabled = state.groups.length >= 20;

  if (!state.groups.length && !state.endpoints.length) {
    const empty = document.createElement('div');
    empty.className = 'rail-empty';
    empty.innerHTML = '<p>还没有接收端点。</p><p>新建一个，把请求发到它的 <code>/hook/…</code> 路径。</p>';
    dom.endpointList.append(empty);
    return;
  }

  if (!state.groups.length) {
    const fragment = document.createDocumentFragment();
    state.endpoints.forEach((endpoint, index) => {
      fragment.append(buildEndpointRow(endpoint, index));
    });
    dom.endpointList.append(fragment);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const group of state.groups) {
    const endpoints = state.endpoints.filter((endpoint) => endpoint.groupId === group.id);
    fragment.append(buildGroupSection(group, endpoints));
  }

  const ungrouped = state.endpoints.filter((endpoint) => (
    !endpoint.groupId || !state.groups.some((group) => group.id === endpoint.groupId)
  ));
  if (ungrouped.length) fragment.append(buildGroupSection(null, ungrouped));
  dom.endpointList.append(fragment);
}

function buildGroupSection(group, endpoints) {
  const section = document.createElement('section');
  section.className = 'endpoint-group';
  section.dataset.groupId = group?.id ?? '';
  section.setAttribute('role', 'group');
  if (group) section.setAttribute('aria-label', `${group.name} 分组`);

  const head = document.createElement('div');
  head.className = 'endpoint-group-head';
  head.innerHTML = `
    <span class="endpoint-group-name">${escapeHtml(group?.name ?? '未分组')}</span>
    <span class="endpoint-group-count">${endpoints.length}</span>
    ${group ? `<div class="endpoint-group-actions">
      <button class="icon-btn" type="button" data-group-action="edit" data-group-id="${escapeAttr(group.id)}" aria-label="重命名分组 ${escapeAttr(group.name)}" title="重命名分组">${ICONS.pencil}</button>
      <button class="icon-btn" type="button" data-group-action="delete" data-group-id="${escapeAttr(group.id)}" aria-label="删除分组 ${escapeAttr(group.name)}" title="删除分组（端点移到未分组）">${ICONS.trash}</button>
    </div>` : ''}
  `;

  const items = document.createElement('div');
  items.className = 'endpoint-group-items';
  if (!endpoints.length) {
    items.innerHTML = '<p class="group-empty">暂无端点，可在端点编辑里选择这个分组</p>';
  } else {
    endpoints.forEach((endpoint, index) => {
      items.append(buildEndpointRow(endpoint, index));
    });
  }

  section.append(head, items);
  return section;
}

function buildEndpointRow(endpoint, index) {
  const row = document.createElement('div');
  const active = state.selectedId === endpoint.id;
  const count = state.events.filter((event) => event.endpointId === endpoint.id).length;

  row.className = `endpoint${active ? ' is-active' : ''}`;
  row.dataset.id = endpoint.id;
  row.dataset.groupId = endpoint.groupId ?? '';
  row.setAttribute('role', 'listitem');
  row.tabIndex = 0;
  if (active) row.setAttribute('aria-current', 'true');

  row.innerHTML = `
    <button class="drag-handle" type="button" data-drag-handle tabindex="0"
      aria-label="拖动排序：${escapeAttr(endpoint.name)}，也可按上下方向键移动">${ICONS.grip}</button>
    <div class="endpoint-main">
      <div class="endpoint-name-row">
        <span class="endpoint-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="endpoint-name">${escapeHtml(endpoint.name)}</span>
        ${endpoint.hasSecret ? `<span class="secret-badge" title="已启用签名校验" aria-label="已启用签名校验">${ICONS.lock}</span>` : ''}
        ${(endpoint.channelIds?.length ?? 0) ? `<span class="channel-badge" title="${endpoint.channelIds.length} 个通知渠道" aria-label="${endpoint.channelIds.length} 个通知渠道">${ICONS.bell}<span>${endpoint.channelIds.length}</span></span>` : ''}
        <span class="status-dot${endpoint.active ? '' : ' is-off'}" title="${endpoint.active ? '正在接收请求' : '已暂停'}"></span>
      </div>
      <div class="endpoint-slug">/hook/${escapeHtml(endpoint.slug)}</div>
      ${endpoint.description ? `<div class="endpoint-desc">${escapeHtml(endpoint.description)}</div>` : ''}
    </div>
    <div class="endpoint-side">
      <span class="endpoint-count" title="已记录的请求数">${count}</span>
      <div class="endpoint-actions">
        <button class="icon-btn" type="button" data-action="edit" aria-label="编辑 ${escapeAttr(endpoint.name)}" title="编辑端点">${ICONS.pencil}</button>
        <button class="icon-btn" type="button" data-action="toggle" aria-label="${endpoint.active ? '暂停' : '启用'} ${escapeAttr(endpoint.name)}" title="${endpoint.active ? '暂停接收' : '恢复接收'}">${endpoint.active ? ICONS.pause : ICONS.play}</button>
      </div>
    </div>
  `;
  return row;
}

function renderHeader() {
  const endpoint = currentEndpoint();
  dom.clearEventsBtn.dataset.armed = 'false';
  clearTimeout(clearArmTimer);

  if (endpoint) {
    dom.feedEyebrow.textContent = '接收端点';
    dom.feedTitle.textContent = endpoint.name;
    dom.hookUrl.textContent = `/hook/${endpoint.slug}`;
    dom.hookLine.hidden = false;
    dom.viewAllBtn.hidden = false;
    dom.clearEventsBtn.textContent = '清空此端点';
    document.title = `${endpoint.name} · Hookroom`;
  } else {
    dom.feedEyebrow.textContent = '全部端点';
    dom.feedTitle.textContent = '请求流水';
    dom.hookLine.hidden = true;
    dom.viewAllBtn.hidden = true;
    dom.clearEventsBtn.textContent = '清空记录';
    document.title = 'Hookroom · Webhook 收件箱';
  }
}

function animateStat(el, target) {
  const from = Number(el.dataset.value ?? target);
  el.dataset.value = String(target);
  if (from === target || prefersReducedMotion()) {
    el.textContent = numberFormatter.format(target);
    return;
  }
  const started = performance.now();
  const duration = 520;
  const tick = (now) => {
    const progress = Math.min((now - started) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    el.textContent = numberFormatter.format(Math.round(from + (target - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderStats() {
  animateStat(dom.statTotal, state.stats.total);
  animateStat(dom.statToday, state.stats.today);
  const active = state.endpoints.filter((item) => item.active).length;
  dom.statActive.textContent = `${active}/${state.endpoints.length}`;
}

function updateFilters() {
  dom.filters.querySelectorAll('.filter').forEach((button) => {
    const value = button.dataset.method ?? '';
    const selected = value === state.method;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function visibleEvents() {
  return state.events.filter((event) => {
    if (state.selectedId !== 'all' && event.endpointId !== state.selectedId) return false;
    if (state.method && event.method !== state.method) return false;
    return true;
  });
}

function renderEvents() {
  if (state.viewMode === 'compact') renderCompact();
  const events = visibleEvents();
  dom.visibleCount.textContent = `${events.length} 条`;
  dom.eventList.innerHTML = '';

  if (!events.length) {
    dom.eventList.hidden = true;
    renderEmpty();
    dom.emptyState.hidden = false;
    return;
  }

  dom.eventList.hidden = false;
  dom.emptyState.hidden = true;

  const fragment = document.createDocumentFragment();
  const fresh = new Set(state.newIds);
  state.newIds.clear();

  for (const event of events) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('role', 'listitem');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `event-row${fresh.has(event.id) ? ' is-new' : ''}`;
    row.dataset.id = event.id;
    const preview = extractPreview(event);
    row.setAttribute(
      'aria-label',
      `${event.method} ${event.path}，${formatDateTime(event.receivedAt)}${event.signatureValid === false ? '，签名无效' : ''}${Array.isArray(event.forwarding) && event.forwarding.some((item) => !item.success) ? '，有通知转发失败' : ''}${preview ? `，内容：${preview.slice(0, 80)}` : ''}`,
    );
    row.innerHTML = `
      <span class="event-time" title="${escapeAttr(formatDateTime(event.receivedAt))}">${escapeHtml(timeLabel(event.receivedAt))}</span>
      <span class="method-badge" data-method="${escapeAttr(event.method)}">${escapeHtml(event.method)}</span>
      <span class="event-main">
        <span class="event-path-row">
          <span class="event-path">${escapeHtml(event.path)}</span>
          ${event.signatureValid === false ? '<span class="signature-flag" title="签名校验失败，请求已记录">签名无效</span>' : ''}
          ${Array.isArray(event.forwarding) && event.forwarding.some((item) => !item.success) ? '<span class="forward-flag" title="有通知渠道发送失败，点开查看原因">转发失败</span>' : ''}
        </span>
        ${preview ? `<span class="event-preview">${escapeHtml(preview)}</span>` : ''}
      </span>
      <span class="event-ip" title="${escapeAttr(event.ip || '未知来源')}">${escapeHtml(event.ip || '—')}</span>
      <span class="event-size">${formatBytes(event.bodyBytes)}</span>
      <span class="event-chevron" aria-hidden="true">${ICONS.chevron}</span>
    `;
    wrapper.append(row);
    fragment.append(wrapper);
  }
  dom.eventList.append(fragment);

  if (fresh.size) {
    setTimeout(() => {
      dom.eventList.querySelectorAll('.event-row.is-new').forEach((node) => node.classList.remove('is-new'));
    }, 800);
  }
}

function renderEmpty() {
  const scoped = state.events.filter((event) => state.selectedId === 'all' || event.endpointId === state.selectedId);
  const endpoint = currentEndpoint();
  let title;
  let text;
  let showCurl = true;

  if (!state.endpoints.length) {
    title = '还没有接收端点';
    text = '先在左侧新建一个端点，再把请求发到它的 /hook 路径。';
    showCurl = false;
  } else if (scoped.length && state.method) {
    title = '没有匹配的请求';
    text = '当前方法筛选下没有记录，换一个方法或点「全部」查看。';
    showCurl = false;
  } else if (endpoint) {
    title = '这个端点还很安静';
    text = `运行一条 curl，把请求发到 /hook/${endpoint.slug}，它会立刻出现在这里。`;
  } else {
    title = '还没有收到请求';
    text = '从任一接收端点发一条请求，或者先运行下面的示例命令。';
  }

  dom.emptyTitle.textContent = title;
  dom.emptyText.textContent = text;
  dom.emptyCurlBtn.hidden = !showCurl;
}

/* ── 选择与端点操作 ──────────────────────────────────── */

function selectEndpoint(id, { focusRow = false } = {}) {
  if (id === state.selectedId) return;
  state.selectedId = id;
  renderEndpoints();
  renderHeader();
  renderEvents();
  if (dom.feed) dom.feed.scrollTop = 0;
  if (state.detailId) closeDetail();
  if (focusRow) {
    dom.endpointList.querySelector(`.endpoint[data-id="${cssEscape(id)}"]`)?.focus();
  }
}

function openGroupDialog(group = null) {
  if (!group && state.groups.length >= 20) {
    toast('最多只能创建 20 个分组');
    return;
  }
  state.editingGroupId = group?.id ?? null;
  dom.groupForm.reset();
  dom.groupDialogTitle.textContent = group ? '重命名分组' : '新建分组';
  dom.groupName.value = group?.name ?? '';
  dom.groupError.hidden = true;
  dom.groupError.textContent = '';
  dom.groupDialog.showModal();
  setTimeout(() => dom.groupName.focus(), 40);
}

async function saveGroup(event) {
  event.preventDefault();
  const name = dom.groupName.value.trim();
  const editing = state.groups.find((group) => group.id === state.editingGroupId) ?? null;

  const fail = (message) => {
    dom.groupError.hidden = false;
    dom.groupError.textContent = message;
    dom.groupName.focus();
  };

  if (!name) return fail('请填写分组名称');
  if (name.length > 30) return fail('分组名称最多 30 个字符');
  if (state.groups.some((group) => group.id !== state.editingGroupId && group.name.toLowerCase() === name.toLowerCase())) {
    return fail(`分组「${name}」已存在`);
  }

  const group = editing
    ? { ...editing, name }
    : { id: `grp_${randomHex(8)}`, name, createdAt: new Date().toISOString() };
  const groups = editing
    ? state.groups.map((item) => (item.id === editing.id ? group : item))
    : [...state.groups, group];

  dom.groupSaveBtn.disabled = true;
  dom.groupSaveBtn.textContent = '保存中…';
  try {
    const payload = await api('/api/groups', { method: 'PUT', body: { groups } });
    state.groups = Array.isArray(payload.groups) ? payload.groups : groups;
    state.endpoints = Array.isArray(payload.endpoints) ? payload.endpoints : state.endpoints;
    writeLocalEndpoints();
    renderAll();
    dom.groupDialog.close();
    toast(editing ? `分组已重命名为「${name}」` : `分组「${name}」已创建`);
  } catch (error) {
    fail(error.message);
  } finally {
    dom.groupSaveBtn.disabled = false;
    dom.groupSaveBtn.textContent = '保存分组';
  }
}

async function deleteGroup(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return;
  try {
    const payload = await api('/api/groups', {
      method: 'PUT',
      body: { groups: state.groups.filter((item) => item.id !== groupId) },
    });
    state.groups = Array.isArray(payload.groups) ? payload.groups : [];
    state.endpoints = Array.isArray(payload.endpoints) ? payload.endpoints : state.endpoints;
    writeLocalEndpoints();
    renderAll();
    toast(`分组「${group.name}」已删除，端点移到未分组`);
  } catch (error) {
    toast(`删除分组失败：${error.message}`, 'error');
  }
}

function openEndpointDialog(endpoint = null) {
  state.editingId = endpoint?.id ?? null;
  dom.dialogTitle.textContent = endpoint ? '编辑端点' : '新建端点';
  dom.endpointForm.reset();
  clearFormErrors();

  dom.fieldName.value = endpoint?.name ?? '';
  dom.fieldSlug.value = endpoint?.slug ?? generateSlug();
  dom.fieldGroup.innerHTML = '<option value="">未分组</option>'
    + state.groups.map((group) => `<option value="${escapeAttr(group.id)}">${escapeHtml(group.name)}</option>`).join('');
  dom.fieldGroup.value = endpoint?.groupId ?? '';
  dom.fieldDescription.value = endpoint?.description ?? '';
  dom.fieldTarget.value = endpoint?.targetUrl ?? '';
  dom.fieldSecret.value = '';
  dom.fieldSecret.type = 'password';
  dom.toggleSecretBtn.innerHTML = ICONS.eye;
  dom.toggleSecretBtn.setAttribute('aria-label', '显示密钥');

  state.draftChannelIds = [...(endpoint?.channelIds ?? [])];
  state.editingChannelId = null;
  renderEndpointChannelSelection();

  secretCleared = false;
  dom.clearSecretBtn.hidden = !endpoint?.hasSecret;
  dom.clearSecretBtn.textContent = '清除已设置的密钥';
  dom.secretHelp.textContent = endpoint?.hasSecret
    ? '已设置密钥，留空表示保持原密钥。'
    : '启用后，请求必须携带有效签名（X-Signature / X-Hub-Signature-256 / Stripe-Signature），校验失败返回 401。Notely 自定义 Webhook 使用 X-Signature（sha256=…）。';

  dom.deleteEndpointBtn.hidden = !endpoint;
  dom.deleteEndpointBtn.dataset.armed = 'false';
  dom.deleteEndpointBtn.textContent = '删除端点';

  dom.endpointDialog.showModal();
  setTimeout(() => dom.fieldName.focus(), 40);
}

function clearFormErrors() {
  [
    [dom.fieldName, dom.nameError],
    [dom.fieldSlug, dom.slugError],
    [dom.fieldTarget, dom.targetError],
    [dom.fieldSecret, dom.secretError],
  ].forEach(([input, error]) => {
    input.closest('.field').classList.remove('has-error');
    input.removeAttribute('aria-invalid');
    error.hidden = true;
    error.textContent = '';
  });
}

function setFieldError(input, errorEl, message) {
  const field = input.closest('.field');
  field.classList.toggle('has-error', Boolean(message));
  errorEl.hidden = !message;
  errorEl.textContent = message ?? '';
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

async function handleEndpointSubmit(event) {
  event.preventDefault();
  clearFormErrors();

  const name = dom.fieldName.value.trim();
  const slug = dom.fieldSlug.value.trim().toLowerCase();
  const description = dom.fieldDescription.value.trim();
  const targetUrl = dom.fieldTarget.value.trim();
  const secret = dom.fieldSecret.value.trim();

  let invalid = false;
  if (!name) {
    setFieldError(dom.fieldName, dom.nameError, '请填写端点名称');
    invalid = true;
  }
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) {
    setFieldError(dom.fieldSlug, dom.slugError, '只能使用小写字母、数字和中划线，2–40 位');
    invalid = true;
  } else if (state.endpoints.some((item) => item.slug === slug && item.id !== state.editingId)) {
    setFieldError(dom.fieldSlug, dom.slugError, `路径 /hook/${slug} 已被其他端点占用`);
    invalid = true;
  }
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      setFieldError(dom.fieldTarget, dom.targetError, '请填写以 http:// 或 https:// 开头的地址');
      invalid = true;
    }
  }
  if (invalid) return;

  const editing = state.endpoints.find((item) => item.id === state.editingId) ?? null;
  const endpoint = {
    id: editing?.id ?? createEndpointId(),
    slug,
    name,
    description,
    targetUrl,
    groupId: dom.fieldGroup.value || '',
    active: editing?.active ?? true,
    hasSecret: editing?.hasSecret ?? false,
    createdAt: editing?.createdAt ?? new Date().toISOString(),
    channelIds: [...state.draftChannelIds],
  };
  if (secret) {
    endpoint.secret = secret;
    endpoint.hasSecret = true;
  } else if (secretCleared) {
    endpoint.secret = '';
    endpoint.hasSecret = false;
  }

  if (editing) {
    const index = state.endpoints.findIndex((item) => item.id === editing.id);
    state.endpoints.splice(index, 1, endpoint);
  } else {
    state.endpoints.unshift(endpoint);
  }

  const submitBtn = dom.endpointForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = '保存中…';
  await persistEndpoints({ immediate: true });
  submitBtn.disabled = false;
  submitBtn.textContent = '保存端点';

  dom.endpointDialog.close();
  state.editingId = null;
  state.selectedId = endpoint.id;
  state.method = '';
  renderAll();
  dom.feed.scrollTop = 0;
  toast(editing ? `已更新端点「${endpoint.name}」` : `端点「${endpoint.name}」已创建，可以接收请求了`);
}

async function toggleEndpoint(id) {
  const endpoint = state.endpoints.find((item) => item.id === id);
  if (!endpoint) return;
  endpoint.active = !endpoint.active;
  renderEndpoints();
  renderStats();
  renderHeader();
  await persistEndpoints({ immediate: true });
  toast(endpoint.active ? `已启用「${endpoint.name}」` : `已暂停「${endpoint.name}」，新请求会返回 410`);
}

async function deleteCurrentEndpoint() {
  const endpoint = state.endpoints.find((item) => item.id === state.editingId);
  if (!endpoint) return;

  if (dom.deleteEndpointBtn.dataset.armed !== 'true') {
    dom.deleteEndpointBtn.dataset.armed = 'true';
    dom.deleteEndpointBtn.textContent = '再次点击确认删除';
    setTimeout(() => {
      if (dom.deleteEndpointBtn.dataset.armed === 'true') {
        dom.deleteEndpointBtn.dataset.armed = 'false';
        dom.deleteEndpointBtn.textContent = '删除端点';
      }
    }, 3800);
    return;
  }

  const removedLocal = state.events.filter((event) => event.endpointId === endpoint.id).length;
  state.endpoints = state.endpoints.filter((item) => item.id !== endpoint.id);
  state.events = state.events.filter((event) => event.endpointId !== endpoint.id);
  state.stats.total = Math.max(0, state.stats.total - removedLocal);
  if (state.selectedId === endpoint.id) state.selectedId = 'all';
  if (state.detailId && !state.events.some((event) => event.id === state.detailId)) closeDetail();
  recountToday();

  await Promise.all([
    api(`/api/events?endpointId=${encodeURIComponent(endpoint.id)}`, { method: 'DELETE' }).catch(() => {}),
    persistEndpoints({ immediate: true }),
  ]);

  dom.endpointDialog.close();
  state.editingId = null;
  renderAll();
  toast(`已删除端点「${endpoint.name}」`);
}

async function restoreSamples() {
  const samples = [
    { name: '部署通知', slug: 'deploy-notify', description: 'CI 流水线完成后推送构建结果', targetUrl: '' },
    { name: '表单意向', slug: 'form-lead', description: '官网合作表单提交', targetUrl: '' },
  ];
  let added = 0;
  for (const sample of samples) {
    if (state.endpoints.some((item) => item.slug === sample.slug)) continue;
    state.endpoints.push({
      id: createEndpointId(),
      ...sample,
      active: true,
      createdAt: new Date().toISOString(),
    });
    added += 1;
  }
  if (!added) {
    toast('两个示例端点都还在列表里');
    return;
  }
  await persistEndpoints({ immediate: true });
  renderAll();
  toast(`已恢复 ${added} 个示例端点`);
}

function generateSlug() {
  const base = Math.random().toString(36).slice(2, 6);
  let slug = `endpoint-${base}`;
  let index = 1;
  while (state.endpoints.some((item) => item.slug === slug)) slug = `endpoint-${base}-${index++}`;
  return slug;
}

function createEndpointId() {
  if (typeof crypto?.randomUUID === 'function') {
    return `ep_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `ep_${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
}

/* ── 通知渠道 ───────────────────────────────────────── */

function channelDefinition(type) {
  return state.channelTypes.find((item) => item.type === type) ?? null;
}

function channelLabel(type) {
  return channelDefinition(type)?.label ?? type;
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createChannelId() {
  return `ch_${randomHex(8)}`;
}

function renderEndpointChannelSelection() {
  if (!state.channels.length) {
    dom.endpointChannelList.innerHTML = '<p class="channel-empty">还没有配置通知渠道。点「管理渠道」在工具里添加。</p>';
    return;
  }

  dom.endpointChannelList.innerHTML = state.channels.map((channel) => {
    const selected = state.draftChannelIds.includes(channel.id);
    const enabled = channel.enabled !== false;
    return `
      <label class="channel-select${selected ? ' is-selected' : ''}">
        <input type="checkbox" value="${escapeAttr(channel.id)}"${selected ? ' checked' : ''} />
        <span class="channel-select-main">
          <span class="channel-select-name">${escapeHtml(channel.name || channelLabel(channel.type))}</span>
          <span class="channel-select-meta">${escapeHtml(channelLabel(channel.type))}${enabled ? '' : ' · 已暂停'}</span>
        </span>
      </label>
    `;
  }).join('');
}

function updateChannelTypeHelp() {
  const definition = channelDefinition(dom.channelType.value);
  dom.channelTypeHelp.textContent = definition?.description ?? '';
}

function renderChannelFields(definition, channel) {
  if (!definition) {
    dom.channelFields.innerHTML = '';
    return;
  }
  const config = channel?.config ?? {};
  const secretSet = new Set(channel?.secretSet ?? []);

  dom.channelFields.innerHTML = definition.fields.map((field) => {
    const value = config[field.key] ?? field.default ?? '';
    const hasSecret = Boolean(field.sensitive && secretSet.has(field.key));
    const required = field.required ? '<span class="required-mark">必填</span>' : '<span class="optional">可选</span>';
    const id = `channelField_${field.key}`;
    let control;

    if (field.type === 'select') {
      control = `<select id="${id}" data-channel-key="${escapeAttr(field.key)}">${(field.options ?? []).map((option) => (
        `<option value="${escapeAttr(option.value)}"${String(value) === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
      )).join('')}</select>`;
    } else if (field.type === 'textarea') {
      control = `<textarea id="${id}" data-channel-key="${escapeAttr(field.key)}" rows="3" placeholder="${escapeAttr(hasSecret ? '已设置，留空保持不变' : (field.placeholder ?? ''))}">${escapeHtml(value)}</textarea>`;
    } else {
      const inputType = field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : 'text';
      control = `<input id="${id}" data-channel-key="${escapeAttr(field.key)}" type="${inputType}" value="${escapeAttr(hasSecret ? '' : value)}" placeholder="${escapeAttr(hasSecret ? '已设置，留空保持不变' : (field.placeholder ?? ''))}" />`;
    }

    return `<div class="field channel-config-field" data-field-key="${escapeAttr(field.key)}">
      <label for="${id}">${escapeHtml(field.label)} ${required}</label>
      ${control}
      ${field.help ? `<p class="field-help">${escapeHtml(field.help)}</p>` : ''}
      ${hasSecret ? '<p class="field-help channel-secret-set">已配置，留空保持不变</p>' : ''}
      <p class="field-error" data-error-for="${escapeAttr(field.key)}" hidden></p>
    </div>`;
  }).join('');
}

function openChannelDialog(channel = null) {
  if (!state.channelTypes.length) {
    toast('通知渠道目录未加载，请刷新页面后重试', 'error');
    return;
  }
  if (!channel && state.channels.length >= 40) {
    toast('最多配置 40 个全局通知渠道');
    return;
  }

  state.editingChannelId = channel?.id ?? null;
  dom.channelForm.reset();
  dom.channelType.disabled = Boolean(channel);
  dom.channelDialogTitle.textContent = channel ? '编辑通知渠道' : '添加通知渠道';
  dom.channelType.innerHTML = state.channelTypes.map((item) => (
    `<option value="${escapeAttr(item.type)}">${escapeHtml(item.label)}</option>`
  )).join('');
  dom.channelType.value = channel?.type ?? state.channelTypes[0].type;
  dom.channelName.value = channel?.name ?? '';
  dom.channelEnabled.checked = channel ? channel.enabled !== false : true;

  updateChannelTypeHelp();
  renderChannelFields(channelDefinition(dom.channelType.value), channel);
  dom.channelDialog.showModal();
  setTimeout(() => (channel ? dom.channelName : dom.channelType).focus(), 40);
}

async function saveChannel(event) {
  event.preventDefault();
  const definition = channelDefinition(dom.channelType.value);
  if (!definition) return;

  const existing = state.channels.find((item) => item.id === state.editingChannelId) ?? null;
  const previousSecrets = new Set(existing?.secretSet ?? []);
  const config = {};
  const secretSet = new Set(existing?.secretSet ?? []);
  let valid = true;
  let firstError = null;

  for (const field of definition.fields) {
    const input = dom.channelFields.querySelector(`[data-channel-key="${cssEscape(field.key)}"]`);
    const value = input ? input.value.trim() : '';
    const fieldWrap = input?.closest('.channel-config-field');
    const errorEl = dom.channelFields.querySelector(`[data-error-for="${cssEscape(field.key)}"]`);
    const configuredSecret = Boolean(field.sensitive && previousSecrets.has(field.key));
    let message = '';

    if (field.required && !value && !configuredSecret) {
      message = `请填写${field.label}`;
    }
    if (!message && value && field.type === 'url') {
      try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch {
        message = '请填写合法的 http 或 https 地址';
      }
    }

    if (message) {
      valid = false;
      fieldWrap?.classList.add('has-error');
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = message;
      }
      firstError = firstError ?? input;
    } else {
      fieldWrap?.classList.remove('has-error');
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
    }

    if (field.sensitive) {
      if (value) {
        config[field.key] = value;
        secretSet.add(field.key);
      } else if (existing?.config?.[field.key]) {
        config[field.key] = existing.config[field.key];
      }
    } else {
      config[field.key] = value;
    }
  }

  if (!valid) {
    firstError?.focus();
    return;
  }

  const channel = {
    id: existing?.id ?? createChannelId(),
    type: definition.type,
    name: dom.channelName.value.trim() || definition.label,
    enabled: dom.channelEnabled.checked,
    config,
    secretSet: [...secretSet],
  };

  const channels = existing
    ? state.channels.map((item) => (item.id === existing.id ? channel : item))
    : [...state.channels, channel];

  dom.channelSaveBtn.disabled = true;
  dom.channelSaveBtn.textContent = '保存中…';
  try {
    const payload = await api('/api/channels', { method: 'PUT', body: { channels } });
    state.channels = Array.isArray(payload.channels) ? payload.channels : channels;
    state.endpoints = Array.isArray(payload.endpoints) ? payload.endpoints : state.endpoints;
    state.draftChannelIds = state.draftChannelIds.filter((id) => state.channels.some((item) => item.id === id));
    writeLocalEndpoints();
    dom.channelDialog.close();
    renderAll();
    renderEndpointChannelSelection();
    renderTools();
    toast(existing ? `通知渠道「${channel.name}」已更新` : `通知渠道「${channel.name}」已创建`);
  } catch (error) {
    toast(`保存通知渠道失败：${error.message}`, 'error');
  } finally {
    dom.channelSaveBtn.disabled = false;
    dom.channelSaveBtn.textContent = '保存渠道';
  }
}

async function deleteChannel(channelId) {
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel) return;
  if (!window.confirm(`删除通知渠道「${channel.name}」？使用它的端点将不再收到通知。`)) return;
  try {
    const payload = await api('/api/channels', {
      method: 'PUT',
      body: { channels: state.channels.filter((item) => item.id !== channelId) },
    });
    state.channels = payload.channels ?? [];
    state.endpoints = payload.endpoints ?? state.endpoints;
    state.draftChannelIds = state.draftChannelIds.filter((id) => id !== channelId);
    writeLocalEndpoints();
    renderAll();
    renderEndpointChannelSelection();
    renderTools();
    toast(`通知渠道「${channel.name}」已删除`);
  } catch (error) {
    toast(`删除渠道失败：${error.message}`, 'error');
  }
}

async function toggleChannel(channelId) {
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel) return;
  const channels = state.channels.map((item) => (
    item.id === channelId ? { ...item, enabled: item.enabled === false } : item
  ));
  try {
    const payload = await api('/api/channels', { method: 'PUT', body: { channels } });
    state.channels = payload.channels ?? channels;
    state.endpoints = payload.endpoints ?? state.endpoints;
    writeLocalEndpoints();
    renderTools();
    renderEndpointChannelSelection();
    toast(channel.enabled === false ? `已启用「${channel.name}」` : `已暂停「${channel.name}」`);
  } catch (error) {
    toast(`更新渠道失败：${error.message}`, 'error');
  }
}

/* ── 详情 ────────────────────────────────────────────── */

async function openDetail(id) {
  let event = state.events.find((item) => item.id === id);
  if (!event) return;
  state.detailId = id;
  lastFocused = document.activeElement;

  clearTimeout(scrimTimer);
  dom.scrim.hidden = false;
  dom.detailPanel.classList.add('is-open');
  dom.detailPanel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');

  /* 列表接口只给摘要，完整 body / headers 点开时再取 */
  if (event.summary) {
    const payload = await api(`/api/events/${encodeURIComponent(id)}`).catch(() => null);
    if (state.detailId !== id) return;
    if (payload?.event) {
      event = payload.event;
      const index = state.events.findIndex((item) => item.id === id);
      if (index >= 0) state.events[index] = event;
    }
  }

  if (state.detailId !== id) return;
  renderDetail(event);
  setTimeout(() => dom.closeDetailBtn.focus({ preventScroll: true }), 80);
}

function closeDetail() {
  if (!state.detailId) return;
  state.detailId = null;
  dom.detailPanel.classList.remove('is-open');
  dom.detailPanel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('panel-open');
  clearTimeout(scrimTimer);
  scrimTimer = setTimeout(() => {
    if (!state.detailId) dom.scrim.hidden = true;
  }, 340);
  if (lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
}

function renderDetail(event) {
  const endpoint = state.endpoints.find((item) => item.id === event.endpointId);
  const headers = Object.entries(event.headers ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const query = Object.entries(event.query ?? {});
  const bodyText = prettyBody(event);
  const forwarding = Array.isArray(event.forwarding) ? event.forwarding : [];
  const forwardedOk = forwarding.filter((item) => item.success).length;

  dom.detailMethod.textContent = event.method;
  dom.detailMethod.dataset.method = event.method;
  dom.detailPath.textContent = event.path;
  dom.detailSub.textContent = `${formatDateTime(event.receivedAt)} · ${event.ip || '未知来源'} · ${formatBytes(event.bodyBytes)}`;

  dom.detailBody.innerHTML = `
    <div class="detail-actions">
      <button class="ghost-btn" type="button" data-detail-action="copy-curl">${ICONS.copy}复制 curl</button>
      ${bodyText ? `<button class="ghost-btn" type="button" data-detail-action="copy-body">${ICONS.copy}复制请求体</button>` : ''}
      ${forwarding.some((item) => !item.success) ? `<button class="ghost-btn" type="button" data-detail-action="resend">${ICONS.refresh}重发失败渠道</button>` : ''}
      <button class="ghost-btn is-danger" type="button" data-detail-action="delete">${ICONS.trash}删除</button>
    </div>

    <section class="detail-section">
      <h3>概览</h3>
      <dl class="kv-grid">
        <dt>端点</dt><dd>${endpoint ? escapeHtml(endpoint.name) : '（已删除）'}</dd>
        <dt>接收时间</dt><dd>${escapeHtml(formatDateTime(event.receivedAt))}</dd>
        <dt>来源 IP</dt><dd>${escapeHtml(event.ip || '—')}</dd>
        <dt>内容类型</dt><dd>${escapeHtml(event.contentType || '—')}</dd>
        <dt>请求体</dt><dd>${formatBytes(event.bodyBytes)}${event.truncated ? ' · 已截断' : ''}</dd>
        <dt>签名校验</dt><dd>${event.signatureValid === true ? '通过 · HMAC-SHA256' : event.signatureValid === false ? '未通过 · 已记录并返回 401' : '未启用'}</dd>
        <dt>事件 ID</dt><dd>${escapeHtml(event.id)}</dd>
        ${endpoint?.targetUrl ? `<dt>默认转发</dt><dd>${escapeHtml(endpoint.targetUrl)}</dd>` : ''}
      </dl>
    </section>

    <section class="detail-section">
      <h3>通知转发 <span class="section-note">${forwarding.length ? `${forwardedOk}/${forwarding.length} 成功` : '未配置'}</span></h3>
      ${forwarding.length
        ? `<div class="forward-list">${forwarding.map((item) => `
            <div class="forward-item ${item.success ? 'is-ok' : 'is-error'}">
              <span class="forward-status" aria-hidden="true"></span>
              <span class="forward-main">
                <span class="forward-name">${escapeHtml(item.name || channelLabel(item.type))}</span>
                <span class="forward-meta">${escapeHtml(channelLabel(item.type))}${item.attempts ? ` · ${item.attempts} 次尝试` : ''}${item.durationMs ? ` · ${item.durationMs} ms` : ''}</span>
                ${item.error ? `<span class="forward-error">${escapeHtml(item.error)}</span>` : ''}
              </span>
            </div>`).join('')}</div>`
        : '<p class="muted-note">该请求未配置通知渠道，或签名校验失败，未执行转发。</p>'}
    </section>

    <section class="detail-section">
      <h3>查询参数 <span class="section-note">${query.length} 个</span></h3>
      ${query.length
        ? `<div class="query-list">${query.map(([key, value]) => `<div class="query-row"><code>${escapeHtml(key)}</code><code>${escapeHtml(String(value))}</code></div>`).join('')}</div>`
        : '<p class="muted-note">没有查询参数</p>'}
    </section>

    <section class="detail-section">
      <h3>请求头 <span class="section-note">${headers.length} 项</span></h3>
      <table class="headers-table">
        <tbody>
          ${headers.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(Array.isArray(value) ? value.join(', ') : String(value))}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section class="detail-section">
      <h3>请求体 <span class="section-note">${formatBytes(event.bodyBytes)}</span></h3>
      ${bodyText
        ? `<pre class="code-block">${escapeHtml(bodyText)}</pre>`
        : '<p class="code-block is-empty">这个请求没有请求体。</p>'}
    </section>

    <section class="detail-section">
      <h3>重放请求 <span class="section-note">10 秒超时</span></h3>
      <div class="replay-box">
        <label for="replayUrl">目标地址</label>
        <div class="replay-row">
          <input id="replayUrl" type="url" inputmode="url" spellcheck="false"
            placeholder="https://example.com/webhooks" value="${escapeAttr(endpoint?.targetUrl ?? '')}">
          <button class="primary-btn" type="button" id="replayBtn">发送</button>
        </div>
        <p class="replay-note">原始方法、请求头和请求体将原样转发。请求由 Node 服务发起，不受浏览器跨域限制。</p>
        ${event.truncated ? '<p class="replay-note replay-note--warn">请求体超过 32 KB 已截断，重放只包含已保存的部分。</p>' : ''}
        <div class="replay-result" id="replayResult" hidden></div>
      </div>
    </section>
  `;
}

async function replayEvent(event) {
  const input = dom.detailBody.querySelector('#replayUrl');
  const button = dom.detailBody.querySelector('#replayBtn');
  const result = dom.detailBody.querySelector('#replayResult');
  if (!input || !button || !result) return;

  const url = input.value.trim();
  if (!url) {
    result.hidden = false;
    result.classList.add('is-error');
    result.textContent = '请先填写目标地址';
    input.focus();
    return;
  }

  button.disabled = true;
  button.textContent = '发送中…';
  result.hidden = true;

  try {
    const payload = await api(`/api/events/${encodeURIComponent(event.id)}/replay`, {
      method: 'POST',
      body: { url },
    });
    result.hidden = false;
    result.classList.remove('is-error');
    result.textContent = `已转发到 ${payload.target} · 目标返回 ${payload.status} · ${payload.durationMs} ms`;
    toast('请求已重放');
  } catch (error) {
    result.hidden = false;
    result.classList.add('is-error');
    result.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = '发送';
  }
}

async function resendFailedNotifications(event, button) {
  if (!button) return;
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = '重发中…';

  try {
    const payload = await api(`/api/events/${encodeURIComponent(event.id)}/forward`, {
      method: 'POST',
    });
    const updated = payload.event ?? event;
    const index = state.events.findIndex((item) => item.id === updated.id);
    if (index !== -1) state.events.splice(index, 1, updated);
    state.detailId = updated.id;
    renderDetail(updated);
    renderEvents();
    toast('已重发失败的通知渠道');
  } catch (error) {
    toast(`重发失败：${error.message}`, 'error');
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function deleteEvent(event, button) {
  if (button.dataset.armed !== 'true') {
    button.dataset.armed = 'true';
    button.textContent = '再次点击确认';
    setTimeout(() => {
      if (button.isConnected && button.dataset.armed === 'true') {
        button.dataset.armed = 'false';
        button.innerHTML = `${ICONS.trash}删除`;
      }
    }, 3500);
    return;
  }

  try {
    await api(`/api/events/${encodeURIComponent(event.id)}`, { method: 'DELETE' });
    state.events = state.events.filter((item) => item.id !== event.id);
    state.stats.total = Math.max(0, state.stats.total - 1);
    recountToday();
    closeDetail();
    renderStats();
    renderEndpoints();
    renderEvents();
    toast('请求记录已删除');
  } catch (error) {
    toast(`删除失败：${error.message}`, 'error');
  }
}

/* ── 清空 / curl / 复制 ──────────────────────────────── */

function resetClearButton() {
  dom.clearEventsBtn.dataset.armed = 'false';
  dom.clearEventsBtn.textContent = currentEndpoint() ? '清空此端点' : '清空记录';
  clearTimeout(clearArmTimer);
}

async function handleClearEvents() {
  const endpoint = currentEndpoint();
  if (dom.clearEventsBtn.dataset.armed !== 'true') {
    dom.clearEventsBtn.dataset.armed = 'true';
    dom.clearEventsBtn.textContent = endpoint ? '确认清空此端点？' : '确认清空全部？';
    clearTimeout(clearArmTimer);
    clearArmTimer = setTimeout(resetClearButton, 4200);
    return;
  }

  const endpointId = endpoint?.id;
  const removedLocal = endpointId
    ? state.events.filter((event) => event.endpointId === endpointId).length
    : state.events.length;

  resetClearButton();
  dom.clearEventsBtn.disabled = true;
  try {
    const payload = await api(`/api/events${endpointId ? `?endpointId=${encodeURIComponent(endpointId)}` : ''}`, {
      method: 'DELETE',
    });
    const removed = Number(payload.removed ?? removedLocal);
    if (endpointId) state.events = state.events.filter((event) => event.endpointId !== endpointId);
    else state.events = [];
    state.stats.total = Math.max(0, state.stats.total - removed);
    recountToday();
    if (state.detailId) closeDetail();
    renderStats();
    renderEndpoints();
    renderEvents();
    toast(`已清空 ${removed} 条请求记录`);
  } catch (error) {
    toast(`清空失败：${error.message}`, 'error');
  } finally {
    dom.clearEventsBtn.disabled = false;
  }
}

function openCurlDialog() {
  const endpoint = currentEndpoint() ?? state.endpoints.find((item) => item.active) ?? state.endpoints[0];
  if (!endpoint) {
    toast('先新建一个接收端点，再获取 curl 示例');
    return;
  }
  const origin = location.origin;
  const body = JSON.stringify({
    event: 'test.ping',
    source: 'hookroom',
    sent_at: new Date().toISOString(),
  });
  dom.curlCode.textContent = `curl -X POST '${origin}/hook/${endpoint.slug}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${body}'`;
  dom.curlDialog.showModal();
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 回退到 execCommand */
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

async function copyAndToast(text, message, button = null) {
  const ok = await copyText(text);
  toast(ok ? message : '复制失败，请手动选择文本', ok ? 'neutral' : 'error');
  if (ok && button?.classList) {
    button.classList.add('is-copied');
    setTimeout(() => button.classList.remove('is-copied'), 900);
  }
}

function buildCurl(event) {
  const query = new URLSearchParams(event.query ?? {}).toString();
  const url = `${location.origin}${event.path}${query ? `?${query}` : ''}`;
  const lines = [`curl -X ${event.method} '${url}'`];
  const headerEntries = Object.entries(event.headers ?? {});
  const interesting = headerEntries
    .filter(([key]) => /^(content-type|authorization|accept|x-[a-z0-9-]+)$/i.test(key))
    .slice(0, 4);
  if (event.body && !interesting.some(([key]) => key.toLowerCase() === 'content-type')) {
    interesting.unshift(['Content-Type', event.contentType || 'application/json']);
  }
  for (const [key, value] of interesting) {
    lines.push(`  -H '${key}: ${String(value).replace(/'/g, "'\\''")}'`);
  }
  if (event.body) lines.push(`  --data-raw '${event.body.replace(/'/g, "'\\''")}'`);
  return lines.join(' \\\n');
}

/* ── 简约视图 ──────────────────────────────────────── */

function readViewMode() {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'detail' ? 'detail' : 'compact';
  } catch {
    return 'compact';
  }
}

function readCompactPageSize() {
  try {
    const value = Number(localStorage.getItem(COMPACT_PAGE_KEY));
    if (Number.isInteger(value) && value >= 1 && value <= 100) return value;
  } catch {
    /* 忽略存储失败 */
  }
  return 10;
}

function applyViewMode() {
  const compact = state.viewMode === 'compact';
  document.documentElement.classList.toggle('view-compact', compact);
  document.documentElement.classList.toggle('view-detail', !compact);
  dom.detailWorkspace.hidden = compact;
  dom.compactView.hidden = !compact;
  document.querySelectorAll('[data-view-mode]').forEach((button) => {
    const active = button.dataset.viewMode === state.viewMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (compact) {
    closeDetail();
    renderCompact();
  }
}

function setViewMode(mode) {
  state.viewMode = mode === 'compact' ? 'compact' : 'detail';
  try {
    localStorage.setItem(VIEW_MODE_KEY, state.viewMode);
  } catch {
    /* 忽略存储失败 */
  }
  applyViewMode();
}

function buildCompactPanel(endpoint) {
  const pageSize = Math.max(1, Number(state.compactPageSize) || 10);
  const events = state.events.filter((event) => event.endpointId === endpoint.id);
  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const currentPage = Math.min(Math.max(state.compactPages[endpoint.id] ?? 1, 1), totalPages);
  state.compactPages[endpoint.id] = currentPage;
  const pageEvents = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const notifications = pageEvents.length
    ? pageEvents.map((event) => `
        <button class="compact-notification" type="button" data-compact-event="${escapeAttr(event.id)}">
          <span class="compact-time" title="${escapeAttr(formatDateTime(event.receivedAt))}">${escapeHtml(timeLabel(event.receivedAt))}</span>
          <span class="method-badge" data-method="${escapeAttr(event.method)}">${escapeHtml(event.method)}</span>
          <span class="compact-preview">${escapeHtml((extractPreview(event) || '（无正文）').slice(0, 72))}</span>
        </button>
      `).join('')
    : `<div class="compact-empty compact-empty--panel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13.5V6a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 6v7.5"/><path d="M4 13.5h4l1.2 2.2h5.6L16 13.5h4V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-4.5Z"/></svg>
        <p>这个端点还没有收到通知</p>
        <span>向 <code>/hook/${escapeHtml(endpoint.slug)}</code> 发一条试试</span>
      </div>`;

  const pager = totalPages > 1
    ? `<div class="compact-pager">
        <button type="button" data-compact-page="prev" data-endpoint="${escapeAttr(endpoint.id)}"${currentPage <= 1 ? ' disabled' : ''}>上一页</button>
        <span>${currentPage} / ${totalPages}</span>
        <button type="button" data-compact-page="next" data-endpoint="${escapeAttr(endpoint.id)}"${currentPage >= totalPages ? ' disabled' : ''}>下一页</button>
      </div>`
    : '';

  return `<div class="compact-panel">
    <div class="compact-panel-head"><span>最近通知</span><span>${events.length} 条</span></div>
    <div class="compact-notifications">${notifications}</div>
    ${pager}
  </div>`;
}

function renderCompact() {
  const endpoints = state.endpoints;
  dom.compactCount.textContent = endpoints.length ? `${endpoints.length} 个端点` : '';
  if (!endpoints.length) {
    dom.compactList.innerHTML = '<div class="compact-empty"><p>还没有接收端点。</p><p>切换到详情模式后可以在左侧新建。</p></div>';
    return;
  }

  dom.compactList.innerHTML = endpoints.map((endpoint) => {
    const expanded = state.compactExpandedId === endpoint.id;
    return `
      <div class="compact-item">
        <button class="compact-endpoint${expanded ? ' is-open' : ''}" type="button" data-compact-endpoint="${escapeAttr(endpoint.id)}" aria-expanded="${expanded}">
          <span class="compact-name">${escapeHtml(endpoint.name)}</span>
          <span class="compact-chevron" aria-hidden="true">${ICONS.chevron}</span>
        </button>
        ${expanded ? buildCompactPanel(endpoint) : ''}
      </div>
    `;
  }).join('');
}

function applyCompactPage(pageButton) {
  const endpointId = pageButton.dataset.endpoint;
  const endpoint = state.endpoints.find((entry) => entry.id === endpointId);
  if (!endpoint) return;

  const pageSize = Math.max(1, Number(state.compactPageSize) || 10);
  const total = state.events.filter((event) => event.endpointId === endpointId).length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(state.compactPages[endpointId] ?? 1, 1), totalPages);
  const target = pageButton.dataset.compactPage === 'next'
    ? Math.min(current + 1, totalPages)
    : Math.max(current - 1, 1);
  if (target === current) return;
  state.compactPages[endpointId] = target;

  const panel = pageButton.closest('.compact-panel');
  if (!panel) {
    renderCompact();
    return;
  }

  /* 只替换面板内容，不重建整张列表：展开态和滚动位置都不会丢 */
  const holder = document.createElement('div');
  holder.innerHTML = buildCompactPanel(endpoint).trim();
  const nextPanel = holder.firstElementChild;
  if (!nextPanel) return;
  panel.replaceWith(nextPanel);

  /* 翻页后若分页条落到视口外，补一次滚动，避免看起来“按钮消失了” */
  const pager = nextPanel.querySelector('.compact-pager');
  if (pager) {
    const rect = pager.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      window.scrollBy({ top: rect.bottom - window.innerHeight + 24, behavior: 'auto' });
    }
  }
}

function handleCompactClick(event) {
  const pageButton = event.target.closest('[data-compact-page]');
  if (pageButton) {
    applyCompactPage(pageButton);
    return;
  }

  const eventButton = event.target.closest('[data-compact-event]');
  if (eventButton) {
    openDetail(eventButton.dataset.compactEvent);
    return;
  }

  const endpointButton = event.target.closest('[data-compact-endpoint]');
  if (!endpointButton) return;
  const id = endpointButton.dataset.compactEndpoint;
  const item = endpointButton.closest('.compact-item');

  if (state.compactExpandedId === id) {
    state.compactExpandedId = null;
    endpointButton.classList.remove('is-open');
    endpointButton.setAttribute('aria-expanded', 'false');
    item?.querySelector('.compact-panel')?.remove();
    return;
  }

  state.compactExpandedId = id;
  if (!state.compactPages[id]) state.compactPages[id] = 1;
  const endpoint = state.endpoints.find((entry) => entry.id === id);
  if (!endpoint || !item) return;
  endpointButton.classList.add('is-open');
  endpointButton.setAttribute('aria-expanded', 'true');
  item.querySelector('.compact-panel')?.remove();
  item.insertAdjacentHTML('beforeend', buildCompactPanel(endpoint));
  playCompactPanelIn(item.querySelector('.compact-panel'));
}

/* ── 简约模式展开：一次很轻的淡入，不做回弹与位移补位 ── */

const COMPACT_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

function prefersReducedMotion() {
  return COMPACT_MOTION.matches;
}

function playCompactPanelIn(panel) {
  if (!panel || prefersReducedMotion()) return;
  panel.classList.add('is-entering');
  const clear = () => panel.classList.remove('is-entering');
  panel.addEventListener('animationend', clear, { once: true });
  setTimeout(clear, 300);
}

/* ── 工具与登录 ────────────────────────────────────── */

function showLogin(info) {
  state.authInfo = info;
  dom.loginScreen.hidden = false;
  dom.loginTotpField.hidden = !info?.totpEnabled;
  dom.loginError.hidden = true;
  dom.loginPassword.value = '';
  dom.loginTotp.value = '';
  if (info?.username) dom.loginUsername.value = info.username;
  setTimeout(() => (dom.loginUsername.value ? dom.loginPassword : dom.loginUsername).focus(), 60);
}

async function showLoginFromStatus() {
  try {
    const response = await fetch('/api/auth/status', { cache: 'no-store' });
    const info = await response.json();
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    showLogin(info);
  } catch {
    showLogin({ enabled: true, authenticated: false });
  }
}

async function submitLogin(event) {
  event.preventDefault();
  dom.loginError.hidden = true;
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: {
        username: dom.loginUsername.value.trim(),
        password: dom.loginPassword.value,
        totp: dom.loginTotp.value.trim(),
      },
    });
    window.location.reload();
  } catch (error) {
    dom.loginError.hidden = false;
    dom.loginError.textContent = error.message;
    dom.loginPassword.focus();
  }
}

function openTools(tab = state.toolsTab || 'keys') {
  state.toolsTab = tab;
  renderTools();
  if (!dom.toolsDialog.open) dom.toolsDialog.showModal();
}

function renderTools() {
  document.querySelectorAll('[data-tools-tab]').forEach((button) => {
    const active = button.dataset.toolsTab === state.toolsTab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });

  if (state.toolsTab === 'channels') dom.toolsBody.innerHTML = renderChannelsTools();
  else if (state.toolsTab === 'display') dom.toolsBody.innerHTML = renderDisplayTools();
  else if (state.toolsTab === 'security') dom.toolsBody.innerHTML = renderSecurityTools();
  else if (state.toolsTab === 'backup') dom.toolsBody.innerHTML = renderBackupTools();
  else dom.toolsBody.innerHTML = renderMcpKeysTools();
}

function apiKeyScopeText(key) {
  if (!key.groupIds?.length && !key.eventIds?.length) return '全部数据';
  const parts = [];
  if (key.groupIds?.length) parts.push(`分组：${key.groupIds.map((id) => groupLabel(id)).join('、')}`);
  if (key.eventIds?.length) parts.push(`单条通知：${key.eventIds.length} 条`);
  return parts.join(' · ');
}

function renderMcpKeysTools() {
  const keys = state.apiKeys ?? [];
  return `
    <div class="tools-section">
      <div class="tools-section-head">
        <div>
          <h3>MCP 密钥</h3>
          <p>AI 客户端用 <code>/mcp</code> 和 Bearer 密钥访问。每个密钥可限定到分组或单条通知，也可以设为只读。</p>
        </div>
        <button class="primary-btn" type="button" data-tools-action="new-key">新建密钥</button>
      </div>
      ${keys.length ? `<div class="key-list">${keys.map((key) => `
        <div class="key-item">
          <div class="key-main">
            <div class="key-title">
              <span>${escapeHtml(key.name)}</span>
              ${key.readOnly ? '<span class="key-tag">只读</span>' : '<span class="key-tag key-tag--write">读写</span>'}
            </div>
            <p class="key-note">${escapeHtml(key.note || '无备注')}</p>
            <p class="key-meta"><code>${escapeHtml(key.prefix)}</code> · ${escapeHtml(apiKeyScopeText(key))} · 创建于 ${formatDateTime(key.createdAt)}${key.lastUsedAt ? ` · 最近使用 ${formatDateTime(key.lastUsedAt)}` : ''}</p>
          </div>
          <div class="key-actions">
            <button class="icon-btn" type="button" data-tools-action="edit-key" data-id="${escapeAttr(key.id)}" aria-label="编辑密钥" title="编辑">${ICONS.pencil}</button>
            <button class="icon-btn" type="button" data-tools-action="delete-key" data-id="${escapeAttr(key.id)}" aria-label="删除密钥" title="删除">${ICONS.trash}</button>
          </div>
        </div>
      `).join('')}</div>` : '<p class="tools-empty">还没有 MCP 密钥。创建一个后，AI 客户端即可接入 <code>/mcp</code>。</p>'}
    </div>
  `;
}

function renderChannelsTools() {
  const channels = state.channels ?? [];
  return `
    <div class="tools-section">
      <div class="tools-section-head">
        <div>
          <h3>通知渠道</h3>
          <p>渠道全局共享。新建或编辑端点时直接勾选需要的渠道，通知会发送到所有已启用渠道。</p>
        </div>
        <button class="primary-btn" type="button" data-tools-action="new-channel">添加渠道</button>
      </div>
      ${channels.length ? `<div class="channel-list">${channels.map((channel) => {
        const enabled = channel.enabled !== false;
        return `
          <div class="channel-item" data-id="${escapeAttr(channel.id)}">
            <div class="channel-item-main">
              <span class="channel-item-name">${escapeHtml(channel.name || channelLabel(channel.type))}</span>
              <span class="channel-item-meta">${escapeHtml(channelLabel(channel.type))} · ${enabled ? '已启用' : '已暂停'}</span>
            </div>
            <div class="channel-actions">
              <button class="icon-btn" type="button" data-channel-action="toggle" data-id="${escapeAttr(channel.id)}" aria-label="${enabled ? '暂停' : '启用'}渠道">${enabled ? ICONS.pause : ICONS.play}</button>
              <button class="icon-btn" type="button" data-channel-action="edit" data-id="${escapeAttr(channel.id)}" aria-label="编辑渠道">${ICONS.pencil}</button>
              <button class="icon-btn" type="button" data-channel-action="delete" data-id="${escapeAttr(channel.id)}" aria-label="删除渠道">${ICONS.trash}</button>
            </div>
          </div>
        `;
      }).join('')}</div>` : '<p class="tools-empty">还没有通知渠道。可以先添加 Webhook、Telegram、企业微信或 SMTP 邮箱。</p>'}
    </div>
  `;
}

function renderDisplayTools() {
  return `
    <div class="tools-section">
      <div class="tools-section-head">
        <div>
          <h3>显示</h3>
          <p>控制简约模式下展开端点后的通知分页数量。</p>
        </div>
      </div>
      <form class="tools-form" data-tools-form="save-display">
        <div class="field">
          <label for="compactPageSize">每页通知条数</label>
          <input id="compactPageSize" name="pageSize" type="number" min="1" max="100" value="${Number(state.compactPageSize) || 10}" />
          <p class="field-help">例如设置为 10，展开端点后每页显示 10 条，超过后显示上一页/下一页。设置保存在当前浏览器。</p>
        </div>
        <div class="field">
          <label for="displayTimezone">显示时区</label>
          <select id="displayTimezone" name="timezone">
            ${TIMEZONE_OPTIONS.map((option) => `<option value="${escapeAttr(option.value)}"${state.timezone === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
          </select>
          <p class="field-help">请求时间以 UTC 存储，页面按这里选择的时区显示；默认跟随浏览器时区。</p>
        </div>
        <button class="primary-btn" type="submit">保存显示设置</button>
      </form>
    </div>
  `;
}

function renderSecurityTools() {
  const auth = state.auth ?? { enabled: false };
  if (!auth.enabled) {
    return `
      <div class="tools-section">
        <div class="tools-section-head"><div><h3>账号保护</h3><p>当前未启用。启用后，面板和 API 需要登录；Webhook 接收不受影响。</p></div></div>
        <form class="tools-form" data-tools-form="enable-auth">
          <div class="field"><label for="enableAuthUser">账号</label><input id="enableAuthUser" name="username" maxlength="60" autocomplete="off" /></div>
          <div class="field"><label for="enableAuthPass">密码</label><input id="enableAuthPass" name="password" type="password" minlength="8" autocomplete="new-password" /><p class="field-help">至少 8 位。</p></div>
          <div class="field"><label for="enableAuthPass2">确认密码</label><input id="enableAuthPass2" name="confirmPassword" type="password" autocomplete="new-password" /></div>
          <p class="field-error" data-tools-error hidden></p>
          <button class="primary-btn" type="submit">启用账号保护</button>
        </form>
      </div>
    `;
  }

  return `
    <div class="tools-section">
      <div class="tools-section-head"><div><h3>账号保护</h3><p>已启用 · 账号 <code>${escapeHtml(auth.username || '')}</code> · TOTP ${auth.totpEnabled ? '已启用' : '未启用'}</p></div></div>
      <div class="tools-actions">
        <button class="ghost-btn" type="button" data-tools-action="logout">退出登录</button>
      </div>

      <h4 class="tools-subtitle">修改密码</h4>
      <form class="tools-form" data-tools-form="change-password">
        <div class="field"><label for="currentPassword">当前密码</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" /></div>
        <div class="field"><label for="newPassword">新密码</label><input id="newPassword" name="newPassword" type="password" minlength="8" autocomplete="new-password" /></div>
        <div class="field"><label for="newPassword2">确认新密码</label><input id="newPassword2" name="confirmPassword" type="password" autocomplete="new-password" /></div>
        <p class="field-error" data-tools-error hidden></p>
        <button class="ghost-btn" type="submit">修改密码</button>
      </form>

      <h4 class="tools-subtitle">两步验证（TOTP）</h4>
      ${auth.totpEnabled
        ? `<form class="tools-form" data-tools-form="disable-totp">
            <div class="field"><label for="disableTotpPassword">密码</label><input id="disableTotpPassword" name="password" type="password" autocomplete="current-password" /></div>
            <p class="field-help">关闭后，登录只需要账号和密码。</p>
            <p class="field-error" data-tools-error hidden></p>
            <button class="ghost-btn" type="submit">关闭 TOTP</button>
          </form>`
        : state.totpSetup
          ? `<div class="totp-setup">
              <p>在验证器 App 中手动添加以下密钥，或使用 URI：</p>
              <pre class="key-secret">${escapeHtml(state.totpSetup.secret)}</pre>
              <p class="field-help">URI：<code>${escapeHtml(state.totpSetup.uri)}</code></p>
              <form class="tools-form" data-tools-form="confirm-totp">
                <div class="field"><label for="confirmTotpCode">输入验证器生成的 6 位验证码</label><input id="confirmTotpCode" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" /></div>
                <p class="field-error" data-tools-error hidden></p>
                <button class="primary-btn" type="submit">确认并启用 TOTP</button>
              </form>
            </div>`
          : `<p class="field-help">启用后，登录时还需要验证器生成的 6 位动态验证码。</p>
            <div class="tools-actions"><button class="ghost-btn" type="button" data-tools-action="setup-totp">生成 TOTP 密钥</button></div>`}

      <h4 class="tools-subtitle">关闭账号保护</h4>
      <form class="tools-form" data-tools-form="disable-auth">
        <div class="field"><label for="disableAuthPassword">密码</label><input id="disableAuthPassword" name="password" type="password" autocomplete="current-password" /></div>
        <p class="field-help">关闭后，任何能访问域名的人都可以打开面板。</p>
        <p class="field-error" data-tools-error hidden></p>
        <button class="ghost-btn is-danger" type="submit">关闭账号保护</button>
      </form>
    </div>
  `;
}

function renderBackupTools() {
  const webdav = state.backupSettings?.webdav ?? {};
  return `
    <div class="tools-section">
      <div class="tools-section-head"><div><h3>备份与恢复</h3><p>备份包含端点、分组、渠道、MCP 密钥、账号配置和通知记录。建议设置备份密码。</p></div></div>

      <h4 class="tools-subtitle">导出到本地</h4>
      <div class="tools-form">
        <div class="field"><label for="backupExportPassword">备份密码 <span class="optional">可选</span></label><input id="backupExportPassword" type="password" autocomplete="new-password" placeholder="留空则导出明文 JSON" /></div>
        <label class="checkbox-row"><input type="checkbox" id="backupExportEvents" checked /> 包含通知记录</label>
        <button class="primary-btn" type="button" data-tools-action="export-local">下载备份文件</button>
      </div>

      <h4 class="tools-subtitle">从本地恢复</h4>
      <div class="tools-form">
        <div class="field"><label for="backupImportFile">备份文件</label><input id="backupImportFile" type="file" accept="application/json,.json" /></div>
        <div class="field"><label for="backupImportPassword">备份密码 <span class="optional">可选</span></label><input id="backupImportPassword" type="password" autocomplete="current-password" /></div>
        <div class="field"><label for="backupImportMode">恢复方式</label>
          <select id="backupImportMode"><option value="merge" selected>合并（保留现有数据，推荐）</option><option value="overwrite">覆盖（清空后恢复）</option></select>
        </div>
        <p class="field-help">默认合并：保留已创建的分组、端点和通知，只补充备份中缺失的内容。</p>
        <button class="ghost-btn is-danger" type="button" data-tools-action="import-local">从文件恢复</button>
      </div>

      <h4 class="tools-subtitle">WebDAV</h4>
      <form class="tools-form" data-tools-form="save-webdav">
        <div class="field"><label for="webdavUrl">WebDAV 目录地址</label><input id="webdavUrl" name="url" type="url" value="${escapeAttr(webdav.url || '')}" placeholder="https://dav.example.com/backups/" /></div>
        <div class="field"><label for="webdavUsername">用户名</label><input id="webdavUsername" name="username" value="${escapeAttr(webdav.username || '')}" autocomplete="off" /></div>
        <div class="field"><label for="webdavPassword">密码</label><input id="webdavPassword" name="password" type="password" placeholder="${webdav.hasPassword ? '已设置，留空保持不变' : 'WebDAV 密码'}" autocomplete="new-password" /></div>
        <div class="field"><label for="webdavPath">远程文件名</label><input id="webdavPath" name="path" value="${escapeAttr(webdav.path || 'hookroom-backup.json')}" /></div>
        <p class="field-error" data-tools-error hidden></p>
        <button class="ghost-btn" type="submit">保存 WebDAV 设置</button>
      </form>

      <div class="tools-form">
        <div class="field"><label for="webdavBackupPassword">备份加密密码 <span class="optional">可选</span></label><input id="webdavBackupPassword" type="password" autocomplete="new-password" /></div>
        <label class="checkbox-row"><input type="checkbox" id="webdavBackupEvents" checked /> 包含通知记录</label>
        <div class="tools-actions">
          <button class="primary-btn" type="button" data-tools-action="webdav-backup">备份到 WebDAV</button>
        </div>
        <div class="field"><label for="webdavRestorePassword">恢复密码 <span class="optional">可选</span></label><input id="webdavRestorePassword" type="password" autocomplete="current-password" /></div>
        <div class="field"><label for="webdavRestoreMode">恢复方式</label>
          <select id="webdavRestoreMode"><option value="merge" selected>合并（保留现有数据，推荐）</option><option value="overwrite">覆盖（清空后恢复）</option></select>
        </div>
        <button class="ghost-btn is-danger" type="button" data-tools-action="webdav-restore">从 WebDAV 恢复</button>
      </div>
    </div>
  `;
}

function toolsError(form, message) {
  const error = form?.querySelector('[data-tools-error]');
  if (error) {
    error.hidden = !message;
    error.textContent = message ?? '';
  }
  if (message) toast(message, 'error');
}

function openApiKeyDialog(key = null) {
  state.editingApiKeyId = key?.id ?? null;
  dom.apiKeyForm.reset();
  dom.apiKeyError.hidden = true;
  dom.apiKeyDialogTitle.textContent = key ? '编辑 MCP 密钥' : '新建 MCP 密钥';
  dom.apiKeySaveBtn.textContent = key ? '保存密钥' : '创建密钥';
  dom.apiKeyName.value = key?.name ?? '';
  dom.apiKeyNote.value = key?.note ?? '';
  dom.apiKeyReadOnly.checked = key?.readOnly === true;
  renderApiKeyScopeLists(key);
  const hasScope = (key?.groupIds?.length ?? 0) > 0 || (key?.eventIds?.length ?? 0) > 0;
  const scope = key && !hasScope ? 'all' : 'scoped';
  document.querySelectorAll('input[name="apiKeyScope"]').forEach((input) => {
    input.checked = input.value === scope;
  });
  updateApiKeyScopeVisibility();
  dom.apiKeyDialog.showModal();
  setTimeout(() => dom.apiKeyName.focus(), 40);
}

function renderApiKeyScopeLists(key = null) {
  const selectedGroups = new Set(key?.groupIds ?? []);
  const selectedEvents = new Set(key?.eventIds ?? []);
  dom.apiKeyGroups.innerHTML = state.groups.length
    ? state.groups.map((group) => `<label class="check-item"><input type="checkbox" value="${escapeAttr(group.id)}" ${selectedGroups.has(group.id) ? 'checked' : ''} /> ${escapeHtml(group.name)}</label>`).join('')
    : '<p class="tools-empty">还没有分组，可在左侧新建。</p>';
  dom.apiKeyEvents.innerHTML = state.events.length
    ? state.events.slice(0, 50).map((event) => {
      const endpoint = state.endpoints.find((item) => item.id === event.endpointId);
      return `<label class="check-item"><input type="checkbox" value="${escapeAttr(event.id)}" ${selectedEvents.has(event.id) ? 'checked' : ''} />
        <span><b>${escapeHtml(endpoint?.name ?? '端点')}</b> · ${escapeHtml(event.method)} ${escapeHtml(event.path)}<small>${escapeHtml(extractPreview(event).slice(0, 60))}</small></span>
      </label>`;
    }).join('')
    : '<p class="tools-empty">还没有通知记录。</p>';
}

function updateApiKeyScopeVisibility() {
  const checked = document.querySelector('input[name="apiKeyScope"]:checked')?.value ?? 'scoped';
  dom.apiKeyScopeFields.hidden = checked === 'all';
}

async function saveApiKey(event) {
  event.preventDefault();
  dom.apiKeyError.hidden = true;
  const name = dom.apiKeyName.value.trim();
  if (!name) {
    dom.apiKeyError.hidden = false;
    dom.apiKeyError.textContent = '请填写密钥名称';
    return;
  }
  const all = document.querySelector('input[name="apiKeyScope"]:checked')?.value === 'all';
  const groupIds = all ? [] : [...dom.apiKeyGroups.querySelectorAll('input:checked')].map((input) => input.value);
  const eventIds = all ? [] : [...dom.apiKeyEvents.querySelectorAll('input:checked')].map((input) => input.value);
  if (!all && !groupIds.length && !eventIds.length) {
    dom.apiKeyError.hidden = false;
    dom.apiKeyError.textContent = '请选择至少一个分组或一条通知';
    return;
  }

  const payload = {
    name,
    note: dom.apiKeyNote.value.trim(),
    groupIds,
    eventIds,
    readOnly: dom.apiKeyReadOnly.checked,
    all,
  };

  dom.apiKeySaveBtn.disabled = true;
  try {
    if (state.editingApiKeyId) {
      const result = await api(`/api/api-keys/${encodeURIComponent(state.editingApiKeyId)}`, {
        method: 'PUT',
        body: payload,
      });
      state.apiKeys = state.apiKeys.map((key) => (key.id === result.key.id ? result.key : key));
      dom.apiKeyDialog.close();
      renderTools();
      toast('MCP 密钥已更新');
    } else {
      const result = await api('/api/api-keys', { method: 'POST', body: payload });
      state.apiKeys.push(result.key);
      dom.apiKeyDialog.close();
      renderTools();
      dom.revealKeySecret.textContent = result.secret;
      dom.revealKeyDialog.showModal();
    }
  } catch (error) {
    dom.apiKeyError.hidden = false;
    dom.apiKeyError.textContent = error.message;
  } finally {
    dom.apiKeySaveBtn.disabled = false;
  }
}

async function deleteApiKey(keyId) {
  const key = state.apiKeys.find((item) => item.id === keyId);
  if (!key) return;
  if (!window.confirm(`删除 MCP 密钥「${key.name}」？使用它的 AI 客户端将立即失去访问权限。`)) return;
  try {
    await api(`/api/api-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' });
    state.apiKeys = state.apiKeys.filter((item) => item.id !== keyId);
    renderTools();
    toast('MCP 密钥已删除');
  } catch (error) {
    toast(`删除密钥失败：${error.message}`, 'error');
  }
}

async function handleToolsClick(event) {
  const action = event.target.closest('[data-tools-action]')?.dataset.toolsAction;
  const channelButton = event.target.closest('[data-channel-action]');
  if (channelButton) {
    const channelId = channelButton.dataset.id;
    if (channelButton.dataset.channelAction === 'edit') openChannelDialog(state.channels.find((channel) => channel.id === channelId));
    if (channelButton.dataset.channelAction === 'delete') deleteChannel(channelId);
    if (channelButton.dataset.channelAction === 'toggle') toggleChannel(channelId);
    return;
  }
  if (!action) return;

  if (action === 'new-key') openApiKeyDialog();
  if (action === 'edit-key') openApiKeyDialog(state.apiKeys.find((key) => key.id === event.target.closest('[data-id]')?.dataset.id));
  if (action === 'delete-key') deleteApiKey(event.target.closest('[data-id]')?.dataset.id);
  if (action === 'new-channel') openChannelDialog();
  if (action === 'logout') {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.reload();
  }
  if (action === 'setup-totp') {
    try {
      state.totpSetup = await api('/api/auth/totp/setup', { method: 'POST' });
      renderTools();
    } catch (error) {
      toast(error.message, 'error');
    }
  }
  if (action === 'export-local') await exportBackupLocal();
  if (action === 'import-local') await importBackupLocal();
  if (action === 'webdav-backup') await backupToWebdav();
  if (action === 'webdav-restore') await restoreFromWebdav();
}

async function handleToolsSubmit(event) {
  const type = event.target.dataset.toolsForm;
  if (!type) return;
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  toolsError(form, '');

  try {
    if (type === 'enable-auth') {
      if (values.password !== values.confirmPassword) throw new Error('两次输入的密码不一致');
      const result = await api('/api/auth/enable', {
        method: 'POST',
        body: { username: values.username, password: values.password },
      });
      state.auth = result.auth;
      state.authInfo = { ...result.auth, authenticated: true };
      renderTools();
      toast('账号保护已启用');
    }
    if (type === 'change-password') {
      if (values.newPassword !== values.confirmPassword) throw new Error('两次输入的新密码不一致');
      await api('/api/auth/password', { method: 'POST', body: values });
      form.reset();
      toast('密码已修改，其他登录会话已失效');
    }
    if (type === 'confirm-totp') {
      const result = await api('/api/auth/totp/confirm', { method: 'POST', body: { code: values.code } });
      state.auth = result.auth;
      state.totpSetup = null;
      renderTools();
      toast('TOTP 已启用');
    }
    if (type === 'disable-totp') {
      const result = await api('/api/auth/totp/disable', { method: 'POST', body: { password: values.password } });
      state.auth = result.auth;
      renderTools();
      toast('TOTP 已关闭');
    }
    if (type === 'disable-auth') {
      await api('/api/auth/disable', { method: 'POST', body: { password: values.password } });
      state.auth = { enabled: false };
      state.authInfo = { enabled: false, authenticated: true };
      renderTools();
      toast('账号保护已关闭');
    }
    if (type === 'save-display') {
      const pageSize = Math.min(Math.max(Number(values.pageSize) || 10, 1), 100);
      const timezone = TIMEZONE_OPTIONS.some((option) => option.value === values.timezone)
        ? values.timezone
        : 'local';
      state.compactPageSize = pageSize;
      state.timezone = timezone;
      try {
        localStorage.setItem(COMPACT_PAGE_KEY, String(pageSize));
        localStorage.setItem(TIMEZONE_KEY, timezone);
      } catch {
        /* 忽略存储失败 */
      }
      recountToday();
      renderAll();
      if (state.detailId) {
        const event = state.events.find((item) => item.id === state.detailId);
        if (event) renderDetail(event);
      }
      renderTools();
      toast(`显示设置已保存 · 时区 ${TIMEZONE_OPTIONS.find((option) => option.value === timezone)?.label ?? timezone}`);
    }
    if (type === 'save-webdav') {
      const result = await api('/api/settings/webdav', {
        method: 'PUT',
        body: { webdav: values },
      });
      state.backupSettings = result.backup;
      renderTools();
      toast('WebDAV 设置已保存');
    }
  } catch (error) {
    toolsError(form, error.message);
  }
}

async function exportBackupLocal() {
  const password = dom.toolsBody.querySelector('#backupExportPassword')?.value ?? '';
  const includeEvents = dom.toolsBody.querySelector('#backupExportEvents')?.checked !== false;
  try {
    const response = await fetch('/api/backup/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, includeEvents }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hookroom-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(password ? '加密备份已导出' : '备份已导出（未加密）');
  } catch (error) {
    toast(`导出失败：${error.message}`, 'error');
  }
}

async function importBackupLocal() {
  const file = dom.toolsBody.querySelector('#backupImportFile')?.files?.[0];
  if (!file) {
    toast('请选择备份文件', 'error');
    return;
  }
  const password = dom.toolsBody.querySelector('#backupImportPassword')?.value ?? '';
  const mode = dom.toolsBody.querySelector('#backupImportMode')?.value === 'overwrite' ? 'overwrite' : 'merge';
  const message = mode === 'overwrite'
    ? '覆盖恢复会清空当前所有端点、渠道、密钥和通知记录，继续？'
    : '合并恢复会保留现有数据，并补充备份中的分组、端点、渠道和通知，继续？';
  if (!window.confirm(message)) return;
  try {
    const text = await file.text();
    const result = await api('/api/backup/import', {
      method: 'POST',
      body: { backup: text, password, mode },
    });
    toast(`${result.mode === 'overwrite' ? '覆盖' : '合并'}恢复完成，正在刷新`);
    setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    toast(`恢复失败：${error.message}`, 'error');
  }
}

async function backupToWebdav() {
  const password = dom.toolsBody.querySelector('#webdavBackupPassword')?.value ?? '';
  const includeEvents = dom.toolsBody.querySelector('#webdavBackupEvents')?.checked !== false;
  try {
    const result = await api('/api/backup/webdav', {
      method: 'POST',
      body: { password, includeEvents },
    });
    toast(result.encrypted ? '加密备份已上传到 WebDAV' : '备份已上传到 WebDAV');
  } catch (error) {
    toast(`WebDAV 备份失败：${error.message}`, 'error');
  }
}

async function restoreFromWebdav() {
  const password = dom.toolsBody.querySelector('#webdavRestorePassword')?.value ?? '';
  const mode = dom.toolsBody.querySelector('#webdavRestoreMode')?.value === 'overwrite' ? 'overwrite' : 'merge';
  const message = mode === 'overwrite'
    ? '覆盖恢复会清空当前所有数据，继续？'
    : '合并恢复会保留现有数据，并补充备份内容，继续？';
  if (!window.confirm(message)) return;
  try {
    const result = await api('/api/backup/webdav/restore', { method: 'POST', body: { password, mode } });
    toast(`${result.mode === 'overwrite' ? '覆盖' : '合并'}恢复完成，正在刷新`);
    setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    toast(`WebDAV 恢复失败：${error.message}`, 'error');
  }
}

/* ── 拖拽排序 ────────────────────────────────────────── */

function initDrag() {
  const list = dom.endpointList;

  list.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle) return;
    const item = handle.closest('.endpoint');
    if (!item) return;

    const rect = item.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      handle,
      item,
      list,
      container: item.closest('.endpoint-group-items') ?? list,
      startY: event.clientY,
      offsetY: event.clientY - rect.top,
      startRect: rect,
      active: false,
      ghost: null,
      slot: null,
    };

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* 部分浏览器不支持捕获，仍可继续 */
    }
  });

  list.addEventListener('pointermove', (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (!dragState.active) {
      if (Math.abs(event.clientY - dragState.startY) < 5) return;
      startDrag();
    }
    event.preventDefault();
    moveGhost(event.clientY);
    updateSlot(event.clientY);
  });

  list.addEventListener('pointerup', endDrag);
  list.addEventListener('pointercancel', endDrag);
  list.addEventListener('lostpointercapture', () => {
    if (dragState?.active) endDrag();
  });
}

function startDrag() {
  const { item, list, startRect } = dragState;
  const slot = document.createElement('div');
  slot.className = 'drop-slot';
  slot.style.height = `${startRect.height}px`;
  item.parentNode.insertBefore(slot, item);
  item.style.display = 'none';

  const ghost = item.cloneNode(true);
  ghost.classList.add('endpoint-ghost');
  ghost.classList.remove('is-active');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.width = `${startRect.width}px`;
  ghost.style.height = `${startRect.height}px`;
  ghost.style.left = `${startRect.left}px`;
  ghost.style.top = `${startRect.top}px`;
  ghost.querySelectorAll('button').forEach((button) => {
    button.tabIndex = -1;
  });
  document.body.append(ghost);

  dragState.active = true;
  dragState.ghost = ghost;
  dragState.slot = slot;
  document.body.classList.add('is-dragging');
  if (list.setPointerCapture && dragState.handle.hasPointerCapture?.(dragState.pointerId) === false) {
    /* 保持现有捕获状态 */
  }
}

function moveGhost(clientY) {
  const { ghost, startRect, startY, offsetY } = dragState;
  const minTop = getRailTop() + 8;
  const maxTop = window.innerHeight - startRect.height - 12;
  const wanted = clientY - offsetY;
  const top = Math.min(Math.max(wanted, minTop), maxTop);
  const delta = top - startRect.top;
  ghost.style.transform = `translateY(${delta}px)`;
  dragState.lastDelta = delta;
}

function updateSlot(clientY) {
  const { container, slot, item } = dragState;
  const candidates = [...container.querySelectorAll('.endpoint')].filter((node) => node !== item);
  let target = null;

  for (const node of candidates) {
    const rect = node.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      target = node;
      break;
    }
  }

  if (target === slot.nextElementSibling) return;
  if (target === null && slot === container.lastElementChild) return;

  flipList(container, () => {
    if (target) container.insertBefore(slot, target);
    else container.append(slot);
  });
}

function flipList(container, mutate) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    mutate();
    return;
  }
  const nodes = [...container.querySelectorAll('.endpoint')].filter((node) => node.style.display !== 'none');
  const before = new Map(nodes.map((node) => [node, node.getBoundingClientRect().top]));
  mutate();
  for (const node of nodes) {
    const delta = before.get(node) - node.getBoundingClientRect().top;
    if (Math.abs(delta) > 1) {
      node.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
        { duration: 190, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
  }
}

function endDrag(event) {
  if (!dragState) return;
  if (!dragState.active) {
    dragState = null;
    return;
  }
  if (event && event.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;

  const { item, slot, ghost } = dragState;
  dragState = null;

  item.style.display = '';
  if (slot.parentNode) slot.parentNode.replaceChild(item, slot);
  ghost.remove();
  document.body.classList.remove('is-dragging');

  const order = collectEndpointOrder();
  const movedId = item.dataset.id;
  const previous = state.endpoints.map((endpoint) => endpoint.id).join('|');
  if (order.join('|') === previous) {
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 80);
    return;
  }

  state.endpoints = order
    .map((id) => state.endpoints.find((endpoint) => endpoint.id === id))
    .filter(Boolean);
  renderEndpoints();
  persistEndpoints();

  const moved = state.endpoints.find((endpoint) => endpoint.id === movedId);
  if (moved) {
    const peers = state.endpoints.filter((endpoint) => (endpoint.groupId ?? '') === (moved.groupId ?? ''));
    const position = peers.findIndex((endpoint) => endpoint.id === moved.id) + 1;
    dom.orderStatus.textContent = `已将「${moved.name}」移动到「${groupLabel(moved.groupId)}」第 ${position} 位`;
  }

  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 80);
}

function collectEndpointOrder() {
  const sections = [...dom.endpointList.querySelectorAll('.endpoint-group')];
  if (!sections.length) {
    return [...dom.endpointList.querySelectorAll('.endpoint')].map((node) => node.dataset.id);
  }
  const ids = [];
  for (const section of sections) {
    for (const node of section.querySelectorAll('.endpoint')) ids.push(node.dataset.id);
  }
  return ids;
}

function groupLabel(groupId) {
  return state.groups.find((group) => group.id === groupId)?.name ?? '未分组';
}

function moveEndpointInGroup(endpointId, targetPeerId) {
  const endpoint = state.endpoints.find((item) => item.id === endpointId);
  const target = state.endpoints.find((item) => item.id === targetPeerId);
  if (!endpoint || !target || endpoint.id === target.id) return;

  const peers = state.endpoints.filter((item) => (item.groupId ?? '') === (endpoint.groupId ?? ''));
  const currentIndex = peers.findIndex((item) => item.id === endpoint.id);
  const targetIndex = peers.findIndex((item) => item.id === target.id);
  const movingDown = targetIndex > currentIndex;

  const globalIndex = state.endpoints.findIndex((item) => item.id === endpoint.id);
  state.endpoints.splice(globalIndex, 1);
  const targetGlobal = state.endpoints.findIndex((item) => item.id === target.id);
  state.endpoints.splice(targetGlobal + (movingDown ? 1 : 0), 0, endpoint);

  renderEndpoints();
  persistEndpoints();
  dom.endpointList
    .querySelector(`.endpoint[data-id="${cssEscape(endpoint.id)}"] [data-drag-handle]`)
    ?.focus();
  const finalPeers = state.endpoints.filter((item) => (item.groupId ?? '') === (endpoint.groupId ?? ''));
  const position = finalPeers.findIndex((item) => item.id === endpoint.id) + 1;
  dom.orderStatus.textContent = `已将「${endpoint.name}」移动到「${groupLabel(endpoint.groupId)}」第 ${position} 位`;
}

function getRailTop() {
  const rail = document.querySelector('.rail');
  return rail ? rail.getBoundingClientRect().top : 0;
}

/* ── 事件绑定 ────────────────────────────────────────── */

function bindEvents() {
  dom.addEndpointBtn.addEventListener('click', () => openEndpointDialog());
  dom.addGroupBtn.addEventListener('click', () => openGroupDialog());
  dom.groupForm.addEventListener('submit', saveGroup);
  document.querySelectorAll('[data-close-group]').forEach((button) => {
    button.addEventListener('click', () => dom.groupDialog.close());
  });
  dom.groupDialog.addEventListener('close', () => {
    state.editingGroupId = null;
  });
  dom.restoreSamplesBtn.addEventListener('click', restoreSamples);
  dom.openCurlBtn.addEventListener('click', openCurlDialog);
  dom.emptyCurlBtn.addEventListener('click', openCurlDialog);
  dom.closeDetailBtn.addEventListener('click', closeDetail);
  dom.scrim.addEventListener('click', closeDetail);
  dom.clearEventsBtn.addEventListener('click', handleClearEvents);
  dom.viewAllBtn.addEventListener('click', () => {
    selectEndpoint('all');
  });
  dom.copyEndpointUrl.addEventListener('click', () => {
    const endpoint = currentEndpoint();
    if (!endpoint) return;
    copyAndToast(`${location.origin}/hook/${endpoint.slug}`, '接收地址已复制', dom.copyEndpointUrl);
  });

  dom.filters.addEventListener('click', (event) => {
    const button = event.target.closest('.filter');
    if (!button) return;
    state.method = button.dataset.method ?? '';
    updateFilters();
    renderEvents();
  });

  dom.eventList.addEventListener('click', (event) => {
    const row = event.target.closest('.event-row');
    if (row) openDetail(row.dataset.id);
  });

  dom.endpointList.addEventListener('click', (event) => {
    if (suppressClick) return;
    const groupAction = event.target.closest('[data-group-action]');
    if (groupAction) {
      const groupId = groupAction.dataset.groupId;
      if (groupAction.dataset.groupAction === 'edit') {
        openGroupDialog(state.groups.find((group) => group.id === groupId));
      }
      if (groupAction.dataset.groupAction === 'delete') {
        deleteGroup(groupId);
      }
      return;
    }
    const row = event.target.closest('.endpoint');
    if (!row) return;

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit') {
      openEndpointDialog(state.endpoints.find((item) => item.id === row.dataset.id));
      return;
    }
    if (action === 'toggle') {
      toggleEndpoint(row.dataset.id);
      return;
    }
    if (event.target.closest('[data-drag-handle]')) return;
    selectEndpoint(row.dataset.id);
  });

  dom.endpointList.addEventListener('keydown', (event) => {
    const handle = event.target.closest('[data-drag-handle]');
    const row = event.target.closest('.endpoint');
    if (!row) return;

    if (handle && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const endpoint = state.endpoints.find((item) => item.id === row.dataset.id);
      if (!endpoint) return;
      const peers = state.endpoints.filter((item) => (item.groupId ?? '') === (endpoint.groupId ?? ''));
      const index = peers.findIndex((item) => item.id === endpoint.id);
      let next = index;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = peers.length - 1;
      else next = event.key === 'ArrowUp' ? index - 1 : index + 1;
      if (next < 0 || next >= peers.length || next === index) return;
      moveEndpointInGroup(endpoint.id, peers[next].id);
      return;
    }

    if (!event.target.closest('[data-action], [data-drag-handle]') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selectEndpoint(row.dataset.id, { focusRow: true });
    }
  });

  dom.manageChannelsBtn.addEventListener('click', () => openTools('channels'));
  dom.endpointChannelList.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    if (checkbox.checked) {
      if (!state.draftChannelIds.includes(checkbox.value)) state.draftChannelIds.push(checkbox.value);
    } else {
      state.draftChannelIds = state.draftChannelIds.filter((id) => id !== checkbox.value);
    }
    checkbox.closest('.channel-select')?.classList.toggle('is-selected', checkbox.checked);
  });
  dom.channelType.addEventListener('change', () => {
    const definition = channelDefinition(dom.channelType.value);
    updateChannelTypeHelp();
    renderChannelFields(definition, null);
  });
  dom.channelForm.addEventListener('submit', saveChannel);
  document.querySelectorAll('[data-close-channel]').forEach((button) => {
    button.addEventListener('click', () => dom.channelDialog.close());
  });
  dom.channelDialog.addEventListener('close', () => {
    state.editingChannelId = null;
  });

  document.querySelectorAll('[data-view-mode]').forEach((button) => {
    button.addEventListener('click', () => setViewMode(button.dataset.viewMode));
  });
  dom.compactList.addEventListener('click', handleCompactClick);
  dom.openToolsBtn.addEventListener('click', () => openTools());
  document.querySelectorAll('[data-close-tools]').forEach((button) => {
    button.addEventListener('click', () => dom.toolsDialog.close());
  });
  document.querySelectorAll('[data-tools-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.toolsTab = button.dataset.toolsTab;
      renderTools();
    });
  });
  dom.toolsBody.addEventListener('click', handleToolsClick);
  dom.toolsBody.addEventListener('submit', handleToolsSubmit);

  document.querySelectorAll('[data-close-api-key]').forEach((button) => {
    button.addEventListener('click', () => dom.apiKeyDialog.close());
  });
  document.querySelectorAll('[data-close-reveal]').forEach((button) => {
    button.addEventListener('click', () => dom.revealKeyDialog.close());
  });
  dom.copyRevealKeyBtn.addEventListener('click', () => {
    copyAndToast(dom.revealKeySecret.textContent ?? '', 'MCP 密钥已复制');
  });
  dom.apiKeyForm.addEventListener('submit', saveApiKey);
  dom.apiKeyDialog.addEventListener('close', () => {
    state.editingApiKeyId = null;
  });
  document.querySelectorAll('input[name="apiKeyScope"]').forEach((input) => {
    input.addEventListener('change', updateApiKeyScopeVisibility);
  });
  dom.loginForm.addEventListener('submit', submitLogin);

  dom.endpointForm.addEventListener('submit', handleEndpointSubmit);
  dom.deleteEndpointBtn.addEventListener('click', deleteCurrentEndpoint);
  dom.endpointDialog.addEventListener('close', () => {
    state.editingId = null;
    secretCleared = false;
    state.draftChannelIds = [];
    state.editingChannelId = null;
    dom.fieldSecret.value = '';
    dom.deleteEndpointBtn.dataset.armed = 'false';
    dom.deleteEndpointBtn.textContent = '删除端点';
    clearFormErrors();
  });

  dom.clearSecretBtn.addEventListener('click', () => {
    secretCleared = !secretCleared;
    dom.fieldSecret.value = '';
    dom.clearSecretBtn.textContent = secretCleared ? '取消清除，保留原密钥' : '清除已设置的密钥';
    dom.secretHelp.textContent = secretCleared
      ? '保存后将移除签名密钥，之后不再校验签名。'
      : '已设置密钥，留空表示保持原密钥。';
  });

  dom.generateSecretBtn.addEventListener('click', () => {
    dom.fieldSecret.value = `whsec_${randomHex(24)}`;
    dom.fieldSecret.type = 'text';
    dom.toggleSecretBtn.innerHTML = ICONS.eyeOff;
    dom.toggleSecretBtn.setAttribute('aria-label', '隐藏密钥');
    secretCleared = false;
    dom.clearSecretBtn.textContent = '清除已设置的密钥';
    dom.secretHelp.textContent = '已生成随机密钥，复制到通知平台并保持两边一致。';
    dom.fieldSecret.focus();
    dom.fieldSecret.select();
  });

  dom.toggleSecretBtn.addEventListener('click', () => {
    const showing = dom.fieldSecret.type === 'text';
    dom.fieldSecret.type = showing ? 'password' : 'text';
    dom.toggleSecretBtn.innerHTML = showing ? ICONS.eye : ICONS.eyeOff;
    dom.toggleSecretBtn.setAttribute('aria-label', showing ? '显示密钥' : '隐藏密钥');
    dom.fieldSecret.focus();
  });

  dom.fieldSecret.addEventListener('input', () => {
    if (!dom.fieldSecret.value.trim()) {
      dom.secretHelp.textContent = secretCleared
        ? '保存后将移除签名密钥，之后不再校验签名。'
        : '已设置密钥，留空表示保持原密钥。';
      return;
    }
    secretCleared = false;
    dom.clearSecretBtn.textContent = '清除已设置的密钥';
    dom.secretHelp.textContent = '保存后会覆盖原有密钥。';
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog')?.close());
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  dom.copyCurlBtn.addEventListener('click', () => {
    copyAndToast(dom.curlCode.textContent ?? '', 'curl 命令已复制', dom.copyCurlBtn);
  });

  dom.detailBody.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-detail-action]')?.dataset.detailAction;
    const replayBtn = event.target.closest('#replayBtn');
    const current = state.events.find((item) => item.id === state.detailId);
    if (!current) return;

    if (replayBtn) {
      replayEvent(current);
      return;
    }
    if (!action) return;

    if (action === 'copy-curl') await copyAndToast(buildCurl(current), 'curl 命令已复制', event.target.closest('[data-detail-action]'));
    if (action === 'copy-body') await copyAndToast(current.body ?? '', '请求体已复制', event.target.closest('[data-detail-action]'));
    if (action === 'resend') {
      await resendFailedNotifications(current, event.target.closest('[data-detail-action="resend"]'));
    }
    if (action === 'delete') {
      const button = event.target.closest('[data-detail-action="delete"]');
      deleteEvent(current, button);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.detailId) closeDetail();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_ENDPOINTS && event.newValue) {
      try {
        const list = JSON.parse(event.newValue);
        if (Array.isArray(list) && list.every(isEndpointLike)) {
          state.endpoints = list;
          renderAll();
        }
      } catch {
        /* 忽略其他标签页写入的非法数据 */
      }
    }
  });
}

/* ── 工具函数 ────────────────────────────────────────── */

function readTimezone() {
  try {
    const value = localStorage.getItem(TIMEZONE_KEY);
    if (TIMEZONE_OPTIONS.some((option) => option.value === value)) return value;
  } catch {
    /* 忽略存储失败 */
  }
  return 'local';
}

function zonedFormatter(timeZone) {
  const key = timeZone === 'local' ? 'local' : timeZone;
  if (zonedFormatterCache.has(key)) return zonedFormatterCache.get(key);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone === 'local' ? undefined : timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  zonedFormatterCache.set(key, formatter);
  return formatter;
}

function zonedParts(date, timeZone = state.timezone) {
  const parts = {};
  for (const part of zonedFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return parts;
}

function isToday(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const current = zonedParts(date);
  const now = zonedParts(new Date());
  return current.year === now.year && current.month === now.month && current.day === now.day;
}

function recountToday() {
  state.stats.today = state.events.filter((event) => isToday(event.receivedAt)).length;
}

function timeLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = zonedParts(date);
  if (isToday(iso)) return `${parts.hour}:${parts.minute}:${parts.second}`;
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = zonedParts(date);
  return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function textValue(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function extractPreview(event) {
  if (typeof event.preview === 'string' && event.preview) return event.preview;
  const raw = (event.body ?? '').trim();
  if (!raw) return '';
  const contentType = (event.contentType ?? '').toLowerCase();

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
            const value = textValue(data[key]);
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
        const strings = Object.values(data)
          .map((value) => textValue(value))
          .filter(Boolean)
          .slice(0, 3);
        if (strings.length) return strings.join(' · ').slice(0, 240);
        return `JSON 数据 · ${Object.keys(data).length} 个字段`;
      }
      if (Array.isArray(data)) {
        const strings = data.map((value) => textValue(value)).filter(Boolean).slice(0, 3);
        return strings.length ? strings.join(' · ').slice(0, 240) : `JSON 数组 · ${data.length} 项`;
      }
    } catch {
      /* 被截断或非标准 JSON 时按纯文本处理 */
    }
  }

  return raw.replace(/\s+/g, ' ').slice(0, 240);
}

function prettyBody(event) {
  const raw = event.body ?? '';
  if (!raw) return '';
  const looksJson = /json/i.test(event.contentType ?? '') || /^\s*[[{]/.test(raw);
  if (!looksJson) return raw;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function announce(message) {
  dom.streamStatus.textContent = '';
  setTimeout(() => {
    dom.streamStatus.textContent = message;
  }, 30);
}

function toast(message, tone = 'neutral', duration = 2800) {
  dom.toastText.textContent = message;
  dom.toast.dataset.tone = tone === 'error' ? 'error' : 'neutral';
  dom.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), duration);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  if (typeof CSS?.escape === 'function') return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

boot();