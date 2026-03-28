# CarrotBot API 文档

## 概述

CarrotBot 提供 RESTful API 接口，用于消息管理、设备监控和推送服务。

## 认证

所有 `/api/` 路径下的接口需要 Token 认证。

### 认证方式

| 请求方法 | Token 传递方式 |
|---------|---------------|
| GET / DELETE | Query 参数 `?token=xxx` |
| POST | Body 字段 `{ "token": "xxx", ... }` |

### 错误响应

```json
// 缺少 Token
{ "success": false, "error": "Token required" }

// Token 无效
{ "success": false, "error": "Invalid token" }
```

---

## 公开接口

以下接口无需认证：

### 服务信息

```
GET /
```

**响应：**
```json
{
  "name": "CarrotBot",
  "version": "1.0.0"
}
```

### 健康检查

```
GET /health
```

**响应：**
```json
{
  "status": "ok",
  "uptime": 12345.67
}
```

### 管理页面

```
GET /admin
```

返回 HTML 页面，显示最近消息列表。

---

## API 文档接口

### 获取 API 文档

```
GET /api/docs?token=xxx
```

**响应：**
```json
{
  "success": true,
  "authentication": {
    "required": true,
    "methods": {
      "GET_DELETE": "通过 query 参数传递 token (?token=xxx)",
      "POST": "通过 body 传递 token ({ token: \"xxx\", ... })"
    }
  },
  "endpoints": [...]
}
```

---

## LAN 设备管理

### 获取在线设备列表

```
GET /api/lan/devices?token=xxx
```

**响应：**
```json
{
  "success": true,
  "count": 5,
  "lastUpdate": "2024-01-15T10:30:00.000Z",
  "hosts": [
    {
      "mac": "AA:BB:CC:DD:EE:FF",
      "ip": "192.168.1.100",
      "hostname": "device-name",
      "online": true
    }
  ]
}
```

### 查询设备状态

```
GET /api/lan/query?token=xxx&mac=AA:BB:CC:DD:EE:FF
GET /api/lan/query?token=xxx&ip=192.168.1.100
```

**参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mac | string | 否 | 设备 MAC 地址 |
| ip | string | 否 | 设备 IP 地址 |

**响应：**
```json
{
  "success": true,
  "online": true,
  "host": {
    "mac": "AA:BB:CC:DD:EE:FF",
    "ip": "192.168.1.100",
    "hostname": "device-name",
    "online": true
  }
}
```

### 获取 LAN 服务状态

```
GET /api/lan/status?token=xxx
```

**响应：**
```json
{
  "success": true,
  "connected": true,
  "pollingInterval": 60
}
```

---

## 消息管理

### 查询消息列表

```
GET /api/msg/messages?token=xxx[&参数]
```

**参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| platform | string | 否 | 按平台筛选：`wecom` / `telegram` |
| chatid | string | 否 | 按会话 ID 筛选 |
| userid | string | 否 | 按用户 ID 筛选 |
| direction | string | 否 | 按方向筛选：`in` / `out` |
| msgtype | string | 否 | 按消息类型筛选 |
| keyword | string | 否 | 按关键词搜索 |
| last | string | 否 | 最近时间段：`5m`、`2h`、`3d` |
| startDate | string | 否 | 开始日期：`YYYY-MM-DD` |
| endDate | string | 否 | 结束日期：`YYYY-MM-DD` |
| limit | number | 否 | 返回数量限制，默认 50 |
| offset | number | 否 | 偏移量，用于分页 |

**响应：**
```json
{
  "success": true,
  "total": 100,
  "limit": 50,
  "offset": 0,
  "messages": [
    {
      "id": 1,
      "platform": "telegram",
      "chatid": "123456",
      "userid": "789",
      "direction": "in",
      "msgtype": "text",
      "content": "/ping",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### 获取单条消息

```
GET /api/msg/messages/:id?token=xxx
```

**响应：**
```json
{
  "success": true,
  "message": {
    "id": 1,
    "platform": "telegram",
    "content": "...",
    ...
  }
}
```

### 获取消息统计

```
GET /api/msg/stats?token=xxx
```

**响应：**
```json
{
  "success": true,
  "total": 1000,
  "byPlatform": {
    "wecom": 500,
    "telegram": 500
  },
  "byDirection": {
    "in": 600,
    "out": 400
  }
}
```

### 查询命令消息

查询收到的以 `/` 开头的文本消息（即用户执行的命令）。

```
GET /api/msg/actions?token=xxx[&参数]
```

参数同消息列表查询。

### 删除消息

```
DELETE /api/msg/messages
Content-Type: application/json

{
  "token": "xxx",
  "before": "2024-01-01"
}
```

**参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| before | string | 是 | 截止日期：`YYYY-MM-DD` |

**响应：**
```json
{
  "success": true,
  "deleted": 50
}
```

---

## 缓存管理

### 获取缓存文件列表

```
GET /api/cache/files?token=xxx
```

**响应：**
```json
{
  "success": true,
  "count": 10,
  "totalSize": 1048576,
  "files": [
    {
      "path": "media/xxx.jpg",
      "size": 102400,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### 清理缓存

```
DELETE /api/cache/files
Content-Type: application/json

{
  "token": "xxx",
  "before": "2024-01-01"
}
```

**响应：**
```json
{
  "success": true,
  "deleted": 5
}
```

### 删除指定缓存文件

```
DELETE /api/cache/files/:path?token=xxx
```

`:path` 需要 URL 编码。

**响应：**
```json
{
  "success": true
}
```

---

## 推送任务管理

### 获取任务列表

```
GET /api/push/jobs?token=xxx
```

**响应：**
```json
{
  "success": true,
  "count": 2,
  "jobs": [
    {
      "id": "morning-reminder",
      "enabled": true,
      "cron": "0 9 * * *",
      "content": "早安！",
      "platforms": ["wecom", "telegram"]
    }
  ]
}
```

### 获取任务详情

```
GET /api/push/jobs/:id?token=xxx
```

### 执行任务

```
POST /api/push/jobs/:id/execute
Content-Type: application/json

{
  "token": "xxx"
}
```

### 启用任务

```
POST /api/push/jobs/:id/enable
Content-Type: application/json

{
  "token": "xxx"
}
```

### 禁用任务

```
POST /api/push/jobs/:id/disable
Content-Type: application/json

{
  "token": "xxx"
}
```

### 删除任务

```
DELETE /api/push/jobs/:id?token=xxx
```

---

## 推送发送

### 概述

推送API支持向企业微信和Telegram发送多种类型的消息。

#### 支持的消息类型

| 类型 | 企业微信 | Telegram | 说明 |
|------|---------|----------|------|
| text | ✓ | ✓ | 纯文本消息 |
| markdown | ✓ | ✓ | Markdown格式消息 |
| image | ✓ | ✓ | 图片消息 |
| file | ✓ | ✓ | 文件消息（Telegram为document） |
| news | ✓ | ✗ | 图文消息（仅企业微信） |

#### 文件大小限制

| 平台 | 图片 | 文件 |
|------|------|------|
| 企业微信 | 2MB（超过自动转文件，最大20MB） | 20MB |
| Telegram | 10MB | 50MB |

### 发送到指定平台

```
POST /api/push/send
Content-Type: application/json
```

#### 文本消息

```json
{
  "token": "xxx",
  "platform": "wecom",
  "msgtype": "text",
  "content": "Hello, World!"
}
```

企业微信支持@成员：

```json
{
  "token": "xxx",
  "platform": "wecom",
  "msgtype": "text",
  "content": "Hello @user",
  "mentionedList": ["user1", "user2"],
  "mentionedMobileList": ["13800138000"]
}
```

#### Markdown消息

```json
{
  "token": "xxx",
  "platform": "telegram",
  "msgtype": "markdown",
  "content": "# 标题\n\n**加粗** *斜体*\n\n- 列表项1\n- 列表项2"
}
```

> **注意**: Telegram Markdown消息会自动转义特殊字符，无需手动处理。

企业微信Markdown支持颜色文本：

```json
{
  "token": "xxx",
  "platform": "wecom",
  "msgtype": "markdown",
  "content": "<font color=\"warning\">警告</font> <font color=\"info\">信息</font> <font color=\"comment\">注释</font>"
}
```

#### 图片消息

**方式一：URL**

```json
{
  "token": "xxx",
  "platform": "telegram",
  "msgtype": "image",
  "content": "https://example.com/image.jpg"
}
```

> 企业微信图片URL会自动转为图文消息发送。

**方式二：Base64编码**

```json
{
  "token": "xxx",
  "platform": "wecom",
  "msgtype": "image",
  "content": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

> 企业微信图片超过2MB会自动转为文件发送。

#### 文件消息

**方式一：URL（仅Telegram）**

```json
{
  "token": "xxx",
  "platform": "telegram",
  "msgtype": "file",
  "content": "https://example.com/document.pdf",
  "filename": "document.pdf"
}
```

**方式二：Base64编码**

```json
{
  "token": "xxx",
  "platform": "wecom",
  "msgtype": "file",
  "content": "JVBERi0xLjQK...",
  "filename": "document.pdf"
}
```

> 企业微信文件会自动上传获取media_id后发送。

#### 图文消息（仅企业微信）

```json
{
  "token": "xxx",
  "platform": "wecom",
  "msgtype": "news",
  "articles": [
    {
      "title": "文章标题",
      "description": "文章描述",
      "url": "https://example.com/article",
      "picurl": "https://example.com/cover.jpg"
    }
  ]
}
```

最多支持8篇文章。

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| platform | string | 是 | 目标平台：`wecom` / `telegram` |
| msgtype | string | 否 | 消息类型：`text` / `markdown` / `image` / `file` / `news`，默认 `text` |
| content | string | 是* | 消息内容或Base64编码的文件 |
| filename | string | 否 | 文件名（发送文件时使用） |
| caption | string | 否 | 图片/文件说明（Telegram使用） |
| articles | array | 是* | 图文消息文章列表（仅企业微信news类型） |
| mentionedList | string[] | 否 | @用户ID列表（企业微信text使用） |
| mentionedMobileList | string[] | 否 | @手机号列表（企业微信text使用） |

> `*` content和articles根据消息类型二选一

#### 响应

成功：
```json
{
  "success": true,
  "platform": "wecom",
  "type": "text"
}
```

失败：
```json
{
  "success": false,
  "error": "错误描述"
}
```

### 广播到所有平台

```
POST /api/push/send/all
Content-Type: application/json
```

请求参数同上，无需指定platform。

```json
{
  "token": "xxx",
  "msgtype": "text",
  "content": "广播消息"
}
```

**响应：**
```json
{
  "success": true,
  "results": [
    { "platform": "wecom", "success": true },
    { "platform": "telegram", "success": true }
  ]
}
```

### 获取推送平台状态

```
GET /api/push/status?token=xxx
```

**响应：**
```json
{
  "success": true,
  "platforms": {
    "wecom": {
      "available": true,
      "type": "webhook"
    },
    "telegram": {
      "available": true,
      "type": "bot"
    }
  }
}
```

### 上传文件到企业微信

上传文件获取media_id，用于后续发送文件消息。

```
POST /api/push/wecom/upload
Content-Type: application/json
```

```json
{
  "token": "xxx",
  "filename": "document.pdf",
  "content": "JVBERi0xLjQK...",
  "type": "file"
}
```

**参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filename | string | 是 | 文件名 |
| content | string | 是 | Base64编码的文件内容 |
| type | string | 否 | 文件类型：`file` / `image` / `voice`，默认 `file` |

**响应：**
```json
{
  "success": true,
  "mediaId": "3a8asd892asd8asd"
}
```

> media_id 3天内有效

---

## 错误处理

所有接口在出错时返回统一格式：

```json
{
  "success": false,
  "error": "错误描述"
}
```

常见 HTTP 状态码：
- `400` - 请求参数错误
- `401` - 认证失败
- `500` - 服务器内部错误
