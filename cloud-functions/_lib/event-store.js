import {
  MAX_EVENTS,
  MAX_TOTAL_EVENT_BYTES,
  extractEventPreview,
} from './state.js';

/*
 * 事件分片存储
 *
 * state.json  只放端点/渠道/密钥等配置（几十 KB）
 * events-index.json  摘要索引（最多 500 条摘要，约 100 KB）
 * events-0001.json   最近 50 条完整事件，0002 更早，依此类推
 *
 * 收一条通知只读写「索引 + 最新分片」，与历史总量无关。
 */

export const EVENT_INDEX_KEY = 'events-index.json';
export const EVENT_COUNTERS_KEY = 'events-counters.json';
export const EVENT_SHARD_SIZE = 50;
const INDEX_VERSION = 2;
const SUMMARY_OVERHEAD = 512;

const shardName = (n) => `events-${String(n).padStart(4, '0')}.json`;

function emptyIndex() {
  return { version: INDEX_VERSION, nextShard: 1, shards: [], summaries: [] };
}

function summarizeEvent(event, shard) {
  const results = Array.isArray(event.forwarding) ? event.forwarding : [];
  /* 索引只保留列表真正用到的字段，详情走分片；preview 截到列表可见长度 */
  return {
    summary: true,
    shard,
    id: event.id,
    endpointId: event.endpointId,
    method: event.method,
    path: event.path,
    receivedAt: event.receivedAt,
    ip: event.ip,
    bodyBytes: Number(event.bodyBytes) || 0,
    signatureValid: event.signatureValid ?? null,
    preview: extractEventPreview(event).slice(0, 96),
    forwarding: {
      attempted: results.length,
      success: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
    },
  };
}

function estimateSummaryBytes(summary) {
  return (Number(summary.bodyBytes) || 0) + SUMMARY_OVERHEAD;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function computeCounters(index) {
  const day = todayKey();
  return {
    total: index.summaries.length,
    today: index.summaries.filter((item) => String(item.receivedAt).slice(0, 10) === day).length,
    day,
    updatedAt: new Date().toISOString(),
  };
}

export function createEventStore(store) {
  async function readIndex() {
    const data = await store.readKey(EVENT_INDEX_KEY);
    if (!data || !Array.isArray(data.shards) || !Array.isArray(data.summaries)) return emptyIndex();
    return {
      version: INDEX_VERSION,
      nextShard: Number(data.nextShard) || 1,
      shards: data.shards.filter((shard) => shard && typeof shard.key === 'string'),
      summaries: data.summaries.filter((summary) => summary && typeof summary.id === 'string'),
    };
  }

  async function writeIndex(index) {
    await store.writeKey(EVENT_INDEX_KEY, index);
  }

  /* 统计单独存小文件，/api/state 不再为 total/today 读 300 KB 索引 */
  async function readCounters() {
    const data = await store.readKey(EVENT_COUNTERS_KEY);
    if (data && Number.isFinite(Number(data.total))) {
      return {
        total: Number(data.total) || 0,
        today: data.day === todayKey() ? Number(data.today) || 0 : 0,
      };
    }
    const index = await readIndex();
    const counters = computeCounters(index);
    await store.writeKey(EVENT_COUNTERS_KEY, counters);
    return { total: counters.total, today: counters.today };
  }

  async function syncCounters(index) {
    await store.writeKey(EVENT_COUNTERS_KEY, computeCounters(index));
  }

  /* 从旧版 state.json（整包 events）迁移到分片 */
  async function migrate(state) {
    const legacy = Array.isArray(state.events) ? state.events : [];
    if (!legacy.length) {
      if ('events' in state) delete state.events;
      return null;
    }
    const index = emptyIndex();
    for (let offset = 0; offset < legacy.length; offset += EVENT_SHARD_SIZE) {
      const chunk = legacy.slice(offset, offset + EVENT_SHARD_SIZE);
      const key = shardName(index.nextShard++);
      await store.writeKey(key, { events: chunk });
      index.shards.push({
        key,
        count: chunk.length,
        firstAt: chunk[chunk.length - 1]?.receivedAt ?? '',
        lastAt: chunk[0]?.receivedAt ?? '',
      });
      for (const event of chunk) index.summaries.push(summarizeEvent(event, key));
    }
    index.summaries = index.summaries.slice(0, MAX_EVENTS);
    await writeIndex(index);
    await syncCounters(index);
    delete state.events;
    return index;
  }

  /* 条数 / 字节双上限裁剪，返回需要删除的分片 key */
  async function trim(index) {
    const droppedKeys = [];
    const droppedIds = new Map();

    let total = index.shards.reduce((sum, shard) => sum + (Number(shard.count) || 0), 0);
    while (total > MAX_EVENTS && index.shards.length > 1) {
      const oldest = index.shards.pop();
      total -= Number(oldest.count) || 0;
      droppedKeys.push(oldest.key);
    }
    if (droppedKeys.length) {
      const removed = new Set(droppedKeys);
      index.summaries = index.summaries.filter((summary) => !removed.has(summary.shard));
    }

    let bytes = index.summaries.reduce((sum, summary) => sum + estimateSummaryBytes(summary), 0);
    while (bytes > MAX_TOTAL_EVENT_BYTES && index.summaries.length > 1) {
      const dropped = index.summaries.pop();
      bytes -= estimateSummaryBytes(dropped);
      if (!droppedIds.has(dropped.shard)) droppedIds.set(dropped.shard, new Set());
      droppedIds.get(dropped.shard).add(dropped.id);
    }

    for (const [key, ids] of droppedIds) {
      const shard = await store.readKey(key);
      if (!shard || !Array.isArray(shard.events)) continue;
      const kept = shard.events.filter((event) => !ids.has(event.id));
      if (!kept.length) {
        await store.deleteKey(key);
        index.shards = index.shards.filter((item) => item.key !== key);
        continue;
      }
      shard.events = kept;
      await store.writeKey(key, shard);
      const meta = index.shards.find((item) => item.key === key);
      if (meta) meta.count = kept.length;
    }

    return droppedKeys;
  }

  async function append(event) {
    const index = await readIndex();
    let newest = index.shards[0];

    if (!newest || newest.count >= EVENT_SHARD_SIZE) {
      newest = {
        key: shardName(index.nextShard++),
        count: 0,
        firstAt: event.receivedAt,
        lastAt: event.receivedAt,
      };
      index.shards.unshift(newest);
    }

    const shard = newest.count > 0 ? (await store.readKey(newest.key)) ?? { events: [] } : { events: [] };
    shard.events.unshift(event);
    newest.count = shard.events.length;
    newest.lastAt = event.receivedAt;
    newest.firstAt = shard.events[shard.events.length - 1]?.receivedAt ?? event.receivedAt;

    index.summaries.unshift(summarizeEvent(event, newest.key));
    index.summaries = index.summaries.slice(0, MAX_EVENTS);

    const droppedKeys = await trim(index);
    await store.writeKey(newest.key, shard);
    await writeIndex(index);
    await syncCounters(index);
    for (const key of droppedKeys) await store.deleteKey(key);
    return index;
  }

  async function list({ endpointId = '', method = '', since = '', limit = 200 } = {}) {
    const index = await readIndex();
    let items = index.summaries;
    if (endpointId) items = items.filter((item) => item.endpointId === endpointId);
    if (method) items = items.filter((item) => item.method === method);
    if (since) items = items.filter((item) => String(item.receivedAt) >= since);
    const max = Math.min(Math.max(Number(limit) || 200, 1), MAX_EVENTS);
    return items.slice(0, max);
  }

  async function get(id) {
    const index = await readIndex();
    const summary = index.summaries.find((item) => item.id === id);
    if (!summary) return null;
    const shard = await store.readKey(summary.shard);
    return shard?.events?.find((event) => event.id === id) ?? null;
  }

  async function replace(event) {
    const index = await readIndex();
    const position = index.summaries.findIndex((item) => item.id === event.id);
    if (position < 0) return false;
    const summary = index.summaries[position];
    const shard = await store.readKey(summary.shard);
    if (!shard || !Array.isArray(shard.events)) return false;
    const slot = shard.events.findIndex((item) => item.id === event.id);
    if (slot < 0) return false;
    shard.events[slot] = event;
    index.summaries[position] = summarizeEvent(event, summary.shard);
    await store.writeKey(summary.shard, shard);
    await writeIndex(index);
    return true;
  }

  async function remove(id) {
    const index = await readIndex();
    const position = index.summaries.findIndex((item) => item.id === id);
    if (position < 0) return false;
    const summary = index.summaries[position];
    const shard = await store.readKey(summary.shard);
    if (!shard || !Array.isArray(shard.events)) return false;
    shard.events = shard.events.filter((event) => event.id !== id);
    index.summaries.splice(position, 1);
    const meta = index.shards.find((item) => item.key === summary.shard);
    if (meta) meta.count = shard.events.length;

    if (!shard.events.length) {
      await store.deleteKey(summary.shard);
      index.shards = index.shards.filter((item) => item.key !== summary.shard);
    } else {
      await store.writeKey(summary.shard, shard);
    }
    await writeIndex(index);
    await syncCounters(index);
    return true;
  }

  async function clear(endpointId = '') {
    const index = await readIndex();
    const before = index.summaries.length;

    if (!endpointId) {
      for (const shard of index.shards) await store.deleteKey(shard.key);
      const empty = emptyIndex();
      await writeIndex(empty);
      await syncCounters(empty);
      return before;
    }

    const affected = new Set(
      index.summaries.filter((item) => item.endpointId === endpointId).map((item) => item.shard),
    );
    for (const key of affected) {
      const shard = await store.readKey(key);
      if (!shard || !Array.isArray(shard.events)) continue;
      const kept = shard.events.filter((event) => event.endpointId !== endpointId);
      if (!kept.length) {
        await store.deleteKey(key);
        index.shards = index.shards.filter((item) => item.key !== key);
        continue;
      }
      shard.events = kept;
      await store.writeKey(key, shard);
      const meta = index.shards.find((item) => item.key === key);
      if (meta) meta.count = kept.length;
    }

    index.summaries = index.summaries.filter((item) => item.endpointId !== endpointId);
    await writeIndex(index);
    await syncCounters(index);
    return before - index.summaries.length;
  }

  /* 备份 / MCP 用：按索引顺序拼回完整事件 */
  async function readAll() {
    const index = await readIndex();
    /* 并行读分片：备份导出从串行 ~100ms 降到 ~30ms */
    const shards = await Promise.all(index.shards.map((shard) => store.readKey(shard.key)));
    const events = [];
    for (const data of shards) {
      if (data && Array.isArray(data.events)) events.push(...data.events);
      if (events.length >= MAX_EVENTS) break;
    }
    return events.slice(0, MAX_EVENTS);
  }

  return {
    readIndex,
    readCounters,
    migrate,
    append,
    list,
    get,
    replace,
    remove,
    clear,
    readAll,
    summarizeEvent,
  };
}