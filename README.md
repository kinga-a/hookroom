# Hookroom 钩子间

一个可部署到 EdgeOne Makers 的 Webhook 收件箱：

- 接收任意 HTTP 方法的 Webhook，实时查看方法、路径、Query、Headers、Body、来源 IP 和时间
- 端点分组、拖拽排序、请求筛选、通知正文预览
- 全局通知渠道：自定义 Webhook、Telegram、企业微信、钉钉、邮件（Resend）、邮箱 SMTP、Bark、Gotify、Server酱、PushPlus、ntfy、NotifyX、WPush
- 通知签名校验（HMAC-SHA256）与 Secret 随机生成
- 通知失败自动重试一次，详情里可手动重发失败渠道
- 账号密码 + TOTP 两步验证保护面板与 API
- 多 MCP 密钥，可限授权到指定分组或单条通知，支持备注和只读
- 本地文件 / WebDAV 备份，支持 AES-256-GCM 密码加密，恢复默认合并
- 详情模式 + 简约模式，简约模式只显示居中端点名称，展开查看最近通知并分页

当前版本：**1.5.0**

---

## 1. 架构

```text
浏览器
  ├── GET /              静态页面（public/）
  ├── /hook/:slug        Webhook 接收（公开）
  ├── /api/*             面板 API（启用账号保护后需要登录会话）
  └── /mcp               MCP HTTP 端点（Bearer MCP 密钥）
        │
EdgeOne Makers
  ├── 静态托管 public/
  ├── Cloud Functions
  │    ├── cloud-functions/hook/[[default]].js
  │    ├── cloud-functions/api/[[default]].js
  │    └── cloud-functions/mcp.js
  └── Blob 存储（命名空间 hookroom，文件 state.json）
```

### 目录结构

```text
.
├── cloud-functions/
│   ├── _lib/                   Cloud Functions 共享模块
│   ├── api/[[default]].js      /api/* 路由
│   ├── hook/[[default]].js     /hook/* 路由
│   └── mcp.js                  /mcp 路由
├── public/                     静态前端
├── scripts/prepare-edgeone.mjs 构建前检查
├── mcp/server.js               stdio MCP 桥接器（给 Claude Desktop / Cursor 等）
├── edgeone.json                EdgeOne 部署配置
├── package.json
├── package-lock.json
├── README.md
└── .gitignore
```

### 存储

- EdgeOne 部署使用 **Blob 存储**，默认命名空间 `hookroom`
- 配置（端点、分组、全局渠道、MCP 密钥哈希、账号、WebDAV）在 `state.json`
- 通知事件分片存放：`events-index.json` 保存最多 500 条摘要（约 200–300 KB），`events-0001.json` 起每片 50 条完整事件
- 收一条通知只读写「索引 + 最新分片」，与历史总量无关；列表接口只返回摘要，完整 Body 在点开详情时按需读取
- 旧版把 events 放在 `state.json` 的部署会在首次访问时自动迁移成分片
- 本地开发版本使用 `data/state.json`，不包含在本部署包中

---

## 2. 部署到 EdgeOne（GitHub 导入）

### 2.1 推送到 GitHub

```bash
unzip hookroom-edgeone-v1.3.6.zip
cd hookroom-edgeone

git init
git add .
git commit -m "feat: Hookroom webhook inbox for EdgeOne"
git branch -M main
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main
```

`.gitignore` 已排除 `node_modules/`、`.env*`、`.edgeone/`、`data/`、`dist/` 等，不会提交本地数据。

### 2.2 EdgeOne Makers 配置

在 EdgeOne Makers 控制台：

1. 新建项目 → 导入 Git 仓库
2. 框架选择「其他 / 静态站点」
3. 构建命令：`node scripts/prepare-edgeone.mjs`（`edgeone.json` 已配置）
4. 输出目录：`public`
5. Node 版本：`22.11.0`
6. 安装命令：`npm install`
7. 确保 Blob 存储可用，命名空间使用 `hookroom`（首次访问会自动创建）
8. 部署

`edgeone.json` 中默认区域：

```json
"cloudFunctions": {
  "mainlandRegions": ["ap-guangzhou"],
  "overseasRegions": ["ap-singapore"]
}
```

可以在控制台按需调整。

### 2.3 环境变量（可选）

| 变量 | 必填 | 说明 |
|---|---|---|
| `MCP_TOKEN` | 否 | 可选的 MCP 管理员密钥。不设置时，通过「设置 → MCP 密钥」创建的多把密钥也能正常使用 |
| `HOOKROOM_STORE` | 否 | 覆盖 Blob 命名空间，默认 `hookroom` |

账号密码、MCP 密钥、通知渠道密钥都保存在 Blob 中，不需要写进仓库或环境变量。

### 2.4 命令行部署（替代 GitHub 导入）

```bash
npm install
npx edgeone makers deploy . -n hookroom -t <你的 EDGEONE_API_TOKEN>
```

### 2.5 域名

- 可使用 EdgeOne 提供的默认域名
- 自定义域名在中国大陆加速通常需要完成 ICP 备案
- Webhook 地址格式：`https://<你的域名>/hook/<slug>`

### 2.6 首次使用

1. 打开站点
2. 进入「设置 → 安全」设置账号密码，按需启用 TOTP
3. 进入「设置 → 通知渠道」添加通知渠道
4. 进入「设置 → MCP 密钥」创建 AI 访问密钥
5. 进入「设置 → 备份」配置本地 / WebDAV 备份

---

## 3. 使用说明

### 3.1 接收 Webhook

每个端点有一个接收路径，例如：

```text
https://<你的域名>/hook/deploy-notify
```

支持任意 HTTP 方法。示例：

```bash
curl -X POST 'https://<你的域名>/hook/deploy-notify' \
  -H 'Content-Type: application/json' \
  -H 'X-Signature: sha256=<hmac>' \
  -d '{"title":"磁盘告警","content":"使用率 92%"}'
```

成功后返回：

```json
{
  "ok": true,
  "id": "evt_xxx",
  "endpoint": "deploy-notify",
  "receivedAt": "2026-11-10T10:00:00.000Z",
  "forwarding": { "attempted": 1, "success": 1, "failed": 0 }
}
```

### 3.2 视图模式

- 顶部居中切换：**简约 | 详情**
- 默认进入简约模式
- 简约模式：只居中显示端点名称，点击展开该端点最近通知；超过设置条数显示上一页 / 下一页
- 简约模式展开采用非对称物理曲线：展开 0.52s 弹簧回弹、收起 0.32s 收束；面板用裁切揭示，下方端点用 FLIP 位移补位，全程只走合成层，不逐帧重排
- 视觉规范：4px 基线间距刻度、统一圆角阶梯（4/6/8/12/16）、数字统一等宽并带滚动动画、列表与统计条入场浮入、复制按钮有成功态反馈
- 窄屏（≤560px）简约列表收为一张圆角纸卡，分割线内缩；统计条可横向滑动
- 系统开启「减少动态效果」时自动跳过回弹，直接显示内容
- 详情模式：左侧端点/分组管理，右侧请求流水和详情面板
- 视图偏好保存在当前浏览器
- 「设置 → 显示」可调整简约模式每页通知条数（默认 10，范围 1–100），以及显示时区
- 时间在服务端统一以 UTC ISO 字符串存储；页面默认按浏览器本地时区显示，也可以固定为「中国标准时间 UTC+8」「UTC」等
- 以上显示设置只影响当前浏览器，不改变 API / MCP 返回的 UTC 时间

### 3.3 分组与渠道

- 分组：运维、开发等，手动创建/重命名/删除；删除分组不会删除端点，端点回到「未分组」
- 通知渠道：全局共享；端点编辑时勾选需要的渠道
- 拖拽排序仅限组内；端点可在编辑里切换分组

---

## 4. 连接状态与状态含义

顶部右侧 `class="live"` 不只是展示，它代表实时更新通道的状态：

| 状态 | 圆点 | 含义 |
|---|---|---|
| 实时连接 | 绿色 | 本地 Node 模式的 SSE（`/api/stream`）已连接，新请求会秒级推送到页面 |
| 轮询同步 | 黄色 | EdgeOne 模式不支持 SSE 长连接，前端每 5 秒请求 `/api/events?since=...` 同步 |
| 正在重连 | 红/橙色 | 实时连接断开；浏览器会自动重连，连续失败后自动切换为轮询 |
| 连接中 | 灰色 | 页面刚加载，尚未建立连接 |

其他状态：

- 端点前绿色圆点：正在接收请求
- 端点前空心圆点：已暂停，新请求返回 410
- 请求详情「签名校验：通过」：HMAC-SHA256 校验成功
- 请求详情「签名校验：未通过」：记录已保存，但返回 401，且不会触发通知
- 请求列表「转发失败」：至少一个通知渠道发送失败
- 「通知转发」区块：每个渠道的成功/失败、尝试次数、耗时和失败原因

> EdgeOne Cloud Functions 不能长期保持 SSE 连接，因此线上固定使用 5 秒轮询；`/api/stream` 在该环境返回 501。

---

## 5. 通知渠道与签名

### 5.1 支持的渠道

自定义 Webhook、Telegram、企业微信群机器人、钉钉机器人、邮件（Resend）、邮箱 SMTP、Bark、Gotify、Server酱、PushPlus、ntfy、NotifyX、WPush。

- 通知内容自动从请求 JSON 的 `title`、`content`、`message`、`text`、`description`、`summary` 等字段提取
- 渠道密钥不会通过 API 回显；编辑时留空表示保持原值
- 单个渠道发送失败会自动重试一次（单次超时 4 秒，间隔 700 毫秒）
- 通知在响应 Webhook 之前同步发送，失败重试可能让响应延后最多约 9 秒
- 详情页可手动重发失败且仍启用的渠道
- 没有持久化重试队列：函数中断或长期失败时需要手动重发

### 5.2 签名校验

在端点中配置 Secret 后，接收请求必须带有效签名，否则返回 401，但仍会记录请求并标为「签名无效」，且不会触发通知。

支持：

- `X-Hub-Signature-256: sha256=<hex>`
- `X-Signature` / `X-Signature-256` / `X-Webhook-Signature`
- `X-Shopify-Hmac-Sha256`（base64）
- `Stripe-Signature: t=<timestamp>,v1=<hex>`
- 其他名称包含 `signature` 的自定义头

算法：HMAC-SHA256；支持 hex、`sha256=` 前缀、base64、Stripe 时间戳格式。

Secret 可通过端点表单旁的「生成」按钮随机生成（`whsec_` + 48 位 hex，共 54 位），也可以使用平台提供的密钥。

### 5.3 与 Notely 自定义 Webhook 配合

Notely 的自定义 Webhook 渠道支持 HMAC 签名：

- 填写 Hookroom 接收地址，例如 `https://<你的域名>/hook/<slug>`
- `WEBHOOK_SECRET` 填与 Hookroom 端点 Secret 相同的值
- `WEBHOOK_SIGNATURE_HEADER` 保持默认 `X-Signature`
- Notely 会对最终发送的原始 JSON 请求体计算 HMAC-SHA256，发送 `X-Signature: sha256=<hex>`
- Hookroom 端点启用 Secret 后即可通过校验

Notely 的 `SEC` 字段仅用于钉钉机器人加签，不会用于自定义 Webhook；`WEBHOOK_HEADERS` 是静态请求头，不是 HMAC 签名。

---

## 6. 设置项

### 6.1 MCP 密钥

- 可创建多个密钥
- 名称、备注
- 授权范围：
  - 全部数据
  - 指定分组
  - 指定单条通知
  - 分组和单条通知可以同时选
- 只读密钥：禁止创建/修改/删除、重发、重放和发送测试
- 密钥只在创建成功时显示一次，列表只保留前缀
- 删除密钥立即撤销访问
- 未授权范围外的端点、通知在 MCP 工具结果中不可见

### 6.2 账号保护

- 账号 + 密码（至少 8 位）
- TOTP 两步验证（验证器 App 手动输入密钥或 `otpauth://` URI）
- 登录会话 7 天，Cookie 为 `hookroom_session`，HttpOnly、SameSite=Lax，HTTPS 下自动加 Secure
- 启用后：
  - 面板和 `/api/*` 需要登录
  - `/hook/*` Webhook 接收保持公开
  - `/mcp` 使用 MCP 密钥，不依赖面板登录会话
- 支持修改密码、关闭 TOTP、关闭账号保护、退出登录
- 修改密码会轮换会话密钥，其他已登录会话失效

### 6.3 显示

- 简约模式每页通知条数：默认 10，范围 1–100
- 显示时区：
  - 浏览器本地时区（默认）
  - 中国标准时间 UTC+8
  - 日本时间 UTC+9
  - 新加坡时间 UTC+8
  - 英国时间
  - 美国东部时间
  - UTC
- 通知列表、通知详情、MCP 密钥/分组的创建时间、最近使用时间都按该时区显示
- 「今日」计数也按该时区重新计算
- 设置保存在当前浏览器

### 6.4 备份与恢复

- 导出到本地 JSON 文件
- 从本地 JSON 文件恢复
- WebDAV 上传 / 下载恢复
- 可选备份密码：
  - AES-256-GCM 加密
  - scrypt 派生密钥
  - 密码不会保存
- 恢复方式：
  - **合并（默认）**：保留现有分组、端点、渠道、MCP 密钥、账号和通知，只补充备份中缺失的数据
  - **覆盖**：清空当前数据后完整恢复
- 合并规则：
  - 分组按 ID 或名称匹配，保留现有
  - 渠道按 ID 或类型+名称匹配，保留现有
  - 端点按 ID 或 slug 匹配，保留现有配置
  - 通知按 ID 去重，并映射到已有端点
  - MCP 密钥按 ID 去重
  - 当前已启用账号保护时，合并不会覆盖当前账号
- WebDAV 使用 Basic Auth，地址填目录 URL，例如 `https://dav.example.com/backups/`

> 备份包含端点密钥、渠道密钥、账号密码哈希、MCP 密钥哈希和通知正文，建议设置备份密码。

---

## 7. API 说明

所有 `/api/*` 路径默认返回 JSON，`Cache-Control: no-store`。

### 7.1 鉴权

启用账号保护后，除以下公开接口外，其余 `/api/*` 需要登录会话 Cookie：

- `GET /api/health`
- `GET /api/auth/status`
- `POST /api/auth/login`

Webhook `/hook/*` 和 MCP `/mcp` 不受面板登录限制。

未登录请求返回：

```http
401 Unauthorized
{"ok":false,"error":"需要登录","authRequired":true}
```

### 7.2 公开接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/auth/status` | 账号保护是否启用、当前是否已登录、TOTP 是否启用 |
| POST | `/api/auth/login` | 登录，body `{username,password,totp?}`，成功设置 Cookie |
| GET | `/hook/:slug` 等任意方法 | 接收 Webhook |
| POST | `/mcp` | MCP JSON-RPC，需要 `Authorization: Bearer <MCP 密钥>` |

### 7.3 认证接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/enable` | 首次启用账号保护 `{username,password}` |
| POST | `/api/auth/logout` | 退出登录 |
| POST | `/api/auth/password` | 修改密码 `{currentPassword,newPassword}` |
| POST | `/api/auth/totp/setup` | 生成 TOTP 密钥，返回 `{secret,uri}` |
| POST | `/api/auth/totp/confirm` | 确认 TOTP `{code}` |
| POST | `/api/auth/totp/disable` | 关闭 TOTP `{password}` |
| POST | `/api/auth/disable` | 关闭账号保护 `{password}` |

### 7.4 配置与数据

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 分组、渠道（脱敏）、端点、MCP 密钥元数据、账号状态、WebDAV 设置、统计 |
| PUT | `/api/groups` | 保存分组 `{groups:[...]}`；删除分组会清空端点 groupId |
| PUT | `/api/channels` | 保存全局渠道 `{channels:[...]}`；敏感字段留空保持原值 |
| PUT | `/api/endpoints` | 保存端点数组 `{endpoints:[...]}` |
| POST | `/api/api-keys` | 创建 MCP 密钥；`{name,note,groupIds,eventIds,readOnly,all}`，返回一次性 secret |
| PUT | `/api/api-keys/:id` | 更新 MCP 密钥范围/备注/只读 |
| DELETE | `/api/api-keys/:id` | 删除 MCP 密钥 |
| PUT | `/api/settings/webdav` | 保存 WebDAV 配置 `{webdav:{url,username,password,path}}` |
| GET | `/api/events` | 查询通知，参数 `endpointId`、`method`、`since`、`limit`（默认 200，最大 500） |
| DELETE | `/api/events` | 清空通知；可带 `endpointId` 只清空一个端点 |
| GET | `/api/events/:id` | 单条通知详情 |
| DELETE | `/api/events/:id` | 删除单条通知 |
| POST | `/api/events/:id/forward` | 重发该通知中失败的渠道 |
| POST | `/api/events/:id/replay` | 重放原始请求到 `{url}` 或端点默认重放地址 |
| GET | `/api/channel-types` | 通知渠道类型与字段 |
| GET | `/api/stream` | 本地 Node SSE；EdgeOne 返回 501 |

### 7.5 备份接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/backup/export` | 导出备份，`{password?,includeEvents?}`；返回附件 JSON |
| POST | `/api/backup/import` | 恢复备份，`{backup,password?,mode?}`；`mode` 为 `merge`（默认）或 `overwrite` |
| POST | `/api/backup/webdav` | 上传备份到 WebDAV，`{password?,includeEvents?}` |
| POST | `/api/backup/webdav/restore` | 从 WebDAV 恢复，`{password?,mode?}` |

### 7.6 端点对象

```json
{
  "id": "ep_xxx",
  "slug": "deploy-notify",
  "name": "部署通知",
  "description": "可空",
  "groupId": "grp_xxx 或空字符串",
  "channelIds": ["ch_xxx"],
  "targetUrl": "默认重放地址，可空",
  "active": true,
  "secret": "仅写入时使用；不传保持，传空字符串清除",
  "createdAt": "ISO 时间"
}
```

`secret`、`hasSecret`、`channelIds` 等字段由 API 处理；响应中的端点不会返回明文 secret。

### 7.7 Webhook 响应码

| 状态码 | 场景 |
|---|---|
| 200 | 接收并保存成功 |
| 401 | 端点配置了 Secret，但签名缺失或不匹配（请求仍会记录） |
| 404 | slug 不存在 |
| 410 | 端点已暂停（不记录） |
| 413 | 请求体超过 1 MB |
| 500 | 服务端异常 |

请求体存储上限 32 KB（超出截断），通知记录最多 500 条，总存储约 4 MB。

### 7.8 连接状态相关

- `receivedAt`、`createdAt`、`exportedAt` 等 API 时间字段均为 UTC ISO 字符串，客户端应按需要自行转换
- 服务端 `stats.today` 按 UTC 日期计算；前端会按当前显示时区重新计算「今日」计数
- `GET /api/state` 返回 `realtime` 与 `storageMode`
- EdgeOne 返回 `storageMode: "cloud"`、`realtime: false`
- 本地 Node 返回 `storageMode: "local"`、`realtime: true`

---

## 8. MCP

### 8.1 连接方式

HTTP 端点：

```text
https://<你的域名>/mcp
```

鉴权头：

```http
Authorization: Bearer <在设置中创建的 MCP 密钥>
```

也可使用包内 stdio 桥接器 `mcp/server.js`：

```json
{
  "mcpServers": {
    "hookroom": {
      "command": "node",
      "args": ["/绝对路径/hookroom-edgeone/mcp/server.js"],
      "env": {
        "HOOKROOM_BASE_URL": "https://<你的域名>",
        "HOOKROOM_MCP_TOKEN": "<MCP 密钥>"
      }
    }
  }
}
```

HTTP 客户端配置：

```json
{
  "mcpServers": {
    "hookroom": {
      "url": "https://<你的域名>/mcp",
      "headers": {
        "Authorization": "Bearer <MCP 密钥>"
      }
    }
  }
}
```

### 8.2 工具列表

| 工具 | 说明 |
|---|---|
| `list_groups` | 列出可见分组 |
| `create_group` | 创建分组（需要全权限、读写密钥） |
| `rename_group` | 重命名分组 |
| `delete_group` | 删除分组 |
| `list_endpoints` | 列出可见端点 |
| `create_endpoint` | 创建端点，可设置 groupId、channelIds、secret |
| `update_endpoint` | 更新端点 |
| `delete_endpoint` | 删除端点及其通知 |
| `set_endpoint_active` | 暂停/启用端点 |
| `list_channels` | 列出全局渠道元数据 |
| `list_channel_types` | 列出渠道类型与字段 |
| `list_notifications` | 查询通知摘要，可按端点/分组/方法/时间过滤 |
| `get_notification` | 获取通知详情 |
| `delete_notification` | 删除通知 |
| `clear_notifications` | 清空通知 |
| `resend_notification` | 重发失败渠道 |
| `replay_notification` | 重放原始请求 |
| `send_test_notification` | 向端点发送测试 Webhook |
| `get_stats` | 查看可见端点/分组数量 |

### 8.3 权限规则

- 密钥范围为空：全部数据
- 指定分组：只能访问该组端点、通知和端点写操作
- 指定单条通知：只能查看/删除/重发/重放该通知；不能管理端点或清空整个端点
- 只读：所有写操作返回工具错误
- 分组创建/重命名/删除需要全权限密钥
- MCP 密钥认证独立于面板账号登录；启用账号保护后 AI 仍可正常使用密钥

---

## 9. 安全建议

1. 部署后立即在「设置 → 安全」启用账号密码，建议同时启用 TOTP
2. MCP 密钥按最小权限授权；不需要写操作的 AI 使用只读密钥
3. 不要提交 `.env`、备份文件、Blob 数据到 GitHub
4. 备份**必须**设置密码（至少 6 位）：备份包含端点密钥、渠道令牌和账号哈希，明文导出会被拒绝
5. WebDAV 使用 HTTPS；仅支持 Basic Auth
6. `/hook/*` 是公开接收口，重要端点应配置 Secret 验签
7. 公网部署的面板建议使用自定义域名和访问控制；当前没有登录失败锁定，依赖 scrypt 的天然限速
8. 出站地址默认禁止回环、私网、链路本地和云元数据（`169.254.169.254`）：重放、通知渠道、WebDAV 都走同一层校验
9. 确实需要访问内网 WebDAV / NAS 时，设置环境变量 `HOOKROOM_ALLOW_PRIVATE_TARGETS=1` 放开回环与 RFC1918；链路本地始终阻断
10. 已启用安全响应头：`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`Strict-Transport-Security` 和 `Content-Security-Policy`

---

## 10. 已知限制

- EdgeOne 不支持 SSE 长连接，实时更新为 5 秒轮询
- 通知同步发送，失败自动重试一次；没有持久化重试队列
- Blob 为读-改-写；高频并发写入存在竞争风险，低频通知场景足够
- SMTP 出站端口可能被云平台限制，EdgeOne 上优先使用 Resend（HTTPS）
- WebDAV 只支持 Basic Auth
- 简约模式页大小和显示时区保存在当前浏览器，不走服务端同步
- API / MCP 返回的时间仍为 UTC，不会因为显示时区设置而改变
- 所有滚动条已隐藏，但键盘/滚轮/触控滚动仍可用
- 事件最多 500 条、总量最多 4 MB；单条存储 Body 最多 32 KB；备份建议不超过 5 MB
- 事件按 50 条分片存储，单条通知的写入量约等于「索引 + 一个分片」，不再随历史总量线性增长
- 并发写入仍是读-改-写：多实例同时收消息时，后写可能覆盖先写，低频通知场景足够

---

## 11. 故障排查

| 现象 | 排查 |
|---|---|
| 打开页面要求登录 | 已启用账号保护，输入账号、密码和 TOTP |
| Webhook 返回 404 | 检查 `/hook/:slug` 的 slug 是否存在 |
| Webhook 返回 410 | 端点已暂停，在详情模式中启用 |
| Webhook 返回 401 | 端点设置了 Secret，签名缺失或不匹配 |
| Webhook 返回 413 | 请求体超过 1 MB |
| 状态显示「轮询同步」 | EdgeOne 环境正常行为 |
| 状态显示「正在重连」 | 网络/函数连接异常，等待自动重连或刷新 |
| MCP 返回 401 | 密钥错误、已删除或已禁用 |
| MCP 返回 503 | 没有创建任何 MCP 密钥，且未设置 `MCP_TOKEN` |
| 通知一直失败 | 详情查看失败原因；检查渠道配置、密钥、目标服务网络 |
| SMTP 发送失败 | 检查授权码、465/587、SSL/STARTTLS；云函数可能限制 SMTP |
| 恢复后数据重复 | 默认合并会保留现有并补充备份；如需完全一致请选择覆盖 |
| 页面无滚动条 | 已全局隐藏滚动条，滚轮/触控仍可滚动 |

---

## 12. 本地开发

本部署包只包含 EdgeOne 形态，不包含本地 `server.js`。如需本地开发，请使用源码工程：

```bash
npm install
npm run dev
npm test
```

本地版本支持 SSE 实时推送和文件存储；EdgeOne 版本使用 Blob 和轮询。

---

## 13. 版本

- 当前部署包：`1.5.0`
- 内置渠道：13 个
- 内置 MCP 工具：19 个
- 自动化测试：49 项