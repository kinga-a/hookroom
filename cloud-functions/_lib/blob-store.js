import { getStore } from '@edgeone/pages-blob';

export function createBlobStore(name = process.env.HOOKROOM_STORE || 'hookroom') {
  const store = getStore({ name, consistency: 'strong' });

  return {
    async read() {
      try {
        const data = await store.get('state.json', { type: 'json' });
        return data && Array.isArray(data.endpoints) ? data : null;
      } catch {
        return null;
      }
    },
    async write(state) {
      await store.setJSON('state.json', state);
    },
    async readKey(key) {
      try {
        const data = await store.get(key, { type: 'json' });
        return data ?? null;
      } catch {
        return null;
      }
    },
    async writeKey(key, value) {
      await store.setJSON(key, value);
    },
    async deleteKey(key) {
      try {
        await store.delete(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}