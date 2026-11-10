import { handleMcp } from './_lib/mcp.js';
import { createBlobStore } from './_lib/blob-store.js';

export default async function onRequest(context) {
  const url = new URL(context.request.url);
  const token = context.env?.MCP_TOKEN || context.env?.HOOKROOM_MCP_TOKEN || process.env.MCP_TOKEN;
  const store = createBlobStore();
  const state = await store.read();
  return handleMcp(context.request, {
    token,
    keys: state?.apiKeys ?? [],
    baseUrl: url.origin,
    internalSecret: state?.internalSecret ?? '',
  });
}
