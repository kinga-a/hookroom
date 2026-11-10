import { normalizeRestoredAuth } from './backup.js';
import { trimEvents } from './state.js';

const MAX_EVENTS = 500;

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

export function buildRestoredState(currentState, data, mode = 'merge') {
  const current = currentState ?? {};
  const backup = data ?? {};
  const overwrite = mode === 'overwrite';

  if (overwrite) {
    const state = {
      version: 2,
      groups: normalizeList(backup.groups),
      channels: normalizeList(backup.channels),
      endpoints: normalizeList(backup.endpoints),
      events: trimEvents(normalizeList(backup.events)),
      apiKeys: normalizeList(backup.apiKeys).filter((key) => key && typeof key.id === 'string' && typeof key.hash === 'string'),
      auth: normalizeRestoredAuth(backup.auth),
      backup: current.backup,
      internalSecret: current.internalSecret,
    };
    return {
      state,
      summary: {
        mode,
        groups: state.groups.length,
        channels: state.channels.length,
        endpoints: state.endpoints.length,
        events: state.events.length,
        apiKeys: state.apiKeys.length,
      },
    };
  }

  const groups = (current.groups ?? []).map((group) => ({ ...group }));
  const groupMap = new Map();
  for (const incoming of normalizeList(backup.groups)) {
    if (!incoming || typeof incoming !== 'object') continue;
    const existing = groups.find((group) => group.id === incoming.id
      || String(group.name).toLowerCase() === String(incoming.name ?? '').toLowerCase());
    if (existing) {
      groupMap.set(incoming.id, existing.id);
    } else {
      groups.push({ ...incoming });
      groupMap.set(incoming.id, incoming.id);
    }
  }

  const channels = (current.channels ?? []).map((channel) => ({ ...channel, config: { ...(channel.config ?? {}) } }));
  const channelMap = new Map();
  for (const incoming of normalizeList(backup.channels)) {
    if (!incoming || typeof incoming !== 'object') continue;
    const existing = channels.find((channel) => channel.id === incoming.id
      || (channel.type === incoming.type && channel.name === incoming.name));
    if (existing) {
      channelMap.set(incoming.id, existing.id);
    } else {
      channels.push({ ...incoming, config: { ...(incoming.config ?? {}) } });
      channelMap.set(incoming.id, incoming.id);
    }
  }

  const endpoints = (current.endpoints ?? []).map((endpoint) => ({ ...endpoint }));
  const endpointMap = new Map();
  const addedEndpoints = [];
  for (const incoming of normalizeList(backup.endpoints)) {
    if (!incoming || typeof incoming !== 'object') continue;
    const existing = endpoints.find((endpoint) => endpoint.id === incoming.id || endpoint.slug === incoming.slug);
    if (existing) {
      endpointMap.set(incoming.id, existing.id);
      continue;
    }
    const endpoint = {
      ...incoming,
      groupId: incoming.groupId && groupMap.has(incoming.groupId) ? groupMap.get(incoming.groupId) : '',
      channelIds: [...new Set((incoming.channelIds ?? []).map((id) => channelMap.get(id)).filter(Boolean))],
    };
    endpoints.push(endpoint);
    addedEndpoints.push(endpoint);
    endpointMap.set(incoming.id, endpoint.id);
  }

  const events = (current.events ?? []).map((event) => ({ ...event }));
  const eventIds = new Set(events.map((event) => event.id));
  let addedEvents = 0;
  for (const incoming of normalizeList(backup.events)) {
    if (!incoming || typeof incoming !== 'object' || eventIds.has(incoming.id)) continue;
    const endpointId = endpointMap.get(incoming.endpointId);
    if (!endpointId) continue;
    events.push({ ...incoming, endpointId });
    eventIds.add(incoming.id);
    addedEvents += 1;
  }
  events.sort((left, right) => String(right.receivedAt).localeCompare(String(left.receivedAt)));
  events.splice(MAX_EVENTS);
  const trimmedEvents = trimEvents(events);

  const apiKeys = (current.apiKeys ?? []).map((key) => ({ ...key }));
  for (const incoming of normalizeList(backup.apiKeys)) {
    if (!incoming || typeof incoming !== 'object' || typeof incoming.id !== 'string' || typeof incoming.hash !== 'string') continue;
    if (apiKeys.some((key) => key.id === incoming.id)) continue;
    apiKeys.push({
      ...incoming,
      groupIds: [...new Set((incoming.groupIds ?? []).map((id) => groupMap.get(id)).filter(Boolean))],
    });
  }

  const auth = current.auth ?? normalizeRestoredAuth(backup.auth);
  const state = {
    version: 2,
    groups,
    channels,
    endpoints,
    events: trimmedEvents,
    apiKeys,
    auth,
    backup: current.backup,
    internalSecret: current.internalSecret,
  };

  return {
    state,
    summary: {
      mode,
      addedGroups: groupMap.size ? groups.length - (current.groups ?? []).length : 0,
      addedChannels: channels.length - (current.channels ?? []).length,
      addedEndpoints: addedEndpoints.length,
      addedEvents,
      totalEvents: trimmedEvents.length,
    },
  };
}
