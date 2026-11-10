#!/usr/bin/env node
/**
 * Hookroom MCP stdio 桥接器。
 * 把 stdio MCP 客户端（Claude Desktop、Cursor、Claude Code 等）的 JSON-RPC 请求
 * 转发到 Hookroom 的 HTTP MCP 端点。
 *
 * 环境变量：
 *   HOOKROOM_BASE_URL     例如 http://127.0.0.1:6080 或 https://hookroom.example.com
 *   HOOKROOM_MCP_TOKEN    与 Hookroom 服务端 MCP_TOKEN 相同
 */
const baseUrl = process.env.HOOKROOM_BASE_URL;
const token = process.env.HOOKROOM_MCP_TOKEN;

if (!baseUrl || !token) {
  console.error('缺少 HOOKROOM_BASE_URL 或 HOOKROOM_MCP_TOKEN');
  process.exit(1);
}

const endpoint = new URL('/mcp', baseUrl).href;
let buffer = '';
let queue = Promise.resolve();

function writeError(id, message) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code: -32603, message: String(message) },
  })}\n`);
}

async function forward(line) {
  let message = null;
  try {
    message = JSON.parse(line);
  } catch {
    writeError(null, 'Parse error');
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: line,
      signal: AbortSignal.timeout(60000),
    });

    if (response.status === 202) return;
    const text = await response.text();
    if (!text) {
      if (response.ok) return;
      writeError(message?.id, `HTTP ${response.status}`);
      return;
    }
    if (!response.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed.error || parsed.message || text;
      } catch {
        /* 保留原文 */
      }
      writeError(message?.id, `${response.status} ${detail}`);
      return;
    }
    process.stdout.write(`${text.trim()}\n`);
  } catch (error) {
    writeError(message?.id, error.message || String(error));
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    queue = queue.then(() => forward(line));
  }
});

process.stdin.on('end', () => {
  const line = buffer.trim();
  if (line) queue = queue.then(() => forward(line));
});
