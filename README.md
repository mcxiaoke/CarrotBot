# CarrotBot - 统一消息网关

CarrotBot 是一个支持多平台的消息推送接收和命令执行服务，支持企业微信和 Telegram 两大平台，可轻松扩展更多平台适配器。

## 功能特性

- **多平台支持**：支持企业微信智能机器人和 Telegram Bot
- **消息路由**：基于命令的消息路由分发系统
- **消息存储**：SQLite 数据库存储消息历史记录
- **媒体缓存**：自动下载和缓存消息中的媒体文件
- **LAN 监控**：支持 TP-Link 路由器局域网设备在线状态监控
- **推送服务**：提供 HTTP API 用于消息推送
- **代理支持**：Telegram 支持 HTTP/SOCKS5 代理

## 技术栈

- **运行时**: Node.js v20 LTS
- **语言**: TypeScript
- **Web 框架**: Fastify
- **企业微信 SDK**: @wecom/aibot-node-sdk (WebSocket 长连接模式)
- **数据库**: better-sqlite3
- **Telegram SDK**: node-telegram-bot-api

## 核心架构

```
用户消息 → Adapter → StandardMessage → Router → Action → 回复
                ↑                           ↓
              平台适配器                  业务处理器
           (WeCom/Telegram)           (Ping/Help/自定义)
```

### 核心接口

```typescript
// 标准消息体 - 系统内部统一流转格式
interface StandardMessage {
  platform: string;      // 平台标识: 'wecom' | 'telegram'
  from: string;          // 发送者/会话 ID
  content: string;       // 消息文本内容
  msgType: MessageType;  // 消息类型: text/image/voice/video/file
  raw: unknown;          // 原始数据（按需使用）
  mediaUrl?: string;     // 媒体文件 URL
  mediaKey?: string;     // 媒体文件 Key
  aesKey?: string;       // 加密密钥（企业微信）
}

// 平台适配器接口
interface IAdapter {
  readonly platform: string;
  parseMessage(raw: unknown): StandardMessage;
  sendMessage(msg: StandardMessage, content: string): Promise<void>;
  sendImage?(msg: StandardMessage, mediaId: string): Promise<void>;
  sendMarkdown?(msg: StandardMessage, content: string): Promise<void>;
}

// 命令处理器接口
interface IAction {
  readonly name: string;           // 命令名称
  readonly description: string;    // 帮助描述
  match(content: string): boolean; // 是否匹配此命令
  execute(msg: StandardMessage, adapter: IAdapter): Promise<void>;
}
```

## 目录结构

```
src/
├── core/                   # 核心模块
│   ├── types.ts           # 核心接口定义
│   └── router.ts          # 消息路由分发器
├── adapters/              # 平台适配器
│   ├── wecom.ts           # 企业微信适配器
│   └── telegram.ts        # Telegram 适配器
├── actions/               # 命令处理器
│   ├── ping.ts            # /ping 命令 - 检查服务状态
│   ├── help.ts            # /help 命令 - 显示帮助信息
│   ├── debug.ts           # 调试命令 - 显示消息详情
│   └── lan.ts             # /lan 命令 - 显示局域网设备
├── lan/                   # 局域网监控模块
│   ├── devices.ts         # 设备信息类和 TP-Link 路由器接口
│   └── service.ts         # LAN 服务管理
├── services/              # 业务服务
│   └── push.ts            # 推送任务服务
├── router/                # API 路由
│   └── push_api.ts        # 推送 API 接口
├── storage/               # 存储层
│   ├── database.ts        # SQLite 数据库操作
│   ├── cache.ts           # 文件缓存管理
│   └── message-store.ts   # 消息存储统一接口
├── index.ts               # 主入口
├── server.ts              # Fastify HTTP 服务
└── logger.ts              # 日志模块
```

## 环境变量配置

创建 `.env` 文件并配置以下环境变量：

```env
# 企业微信智能机器人配置
WECOM_BOT_ID=your-bot-id
WECOM_BOT_SECRET=your-bot-secret

# Telegram 机器人配置
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Telegram 代理配置 (可选)
TELEGRAM_PROXY_TYPE=http        # 代理类型: http 或 socks
TELEGRAM_PROXY_HOST=127.0.0.1   # 代理服务器地址
TELEGRAM_PROXY_PORT=7890        # 代理服务器端口

# 服务端口
PORT=3000

# 路由器配置 (可选，用于 LAN 设备监控)
ROUTER_IP=192.168.1.1
ROUTER_PASSWORD=your-router-password

# 数据存储路径
DATA_PATH=./data

# 日志级别 (trace/debug/info/warn/error)
LOG_LEVEL=info

# 推送 API 配置 (可选)
PUSH_API_TOKEN=your-api-token
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
TELEGRAM_USER_ID=your-user-id
```

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式 (热重载)
npm run dev

# 构建
npm run build

# 生产运行
npm start
```

## 内置命令

| 命令 | 描述 |
|------|------|
| `/ping` | 检查服务运行状态，显示运行时间和内存使用 |
| `/help` | 显示所有可用命令的帮助信息 |
| `/lan` | 显示局域网在线设备列表（需配置路由器） |

## HTTP API 接口

### 基础接口

| 路径 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 服务信息 |
| `/health` | GET | 健康检查 |

### LAN 设备接口

| 路径 | 方法 | 描述 |
|------|------|------|
| `/lan/devices` | GET | 获取在线设备列表 |
| `/lan/query` | GET | 查询设备状态 (参数: mac, ip) |
| `/lan/status` | GET | 获取服务状态 |

### 消息管理接口

| 路径 | 方法 | 描述 |
|------|------|------|
| `/msg/messages` | GET | 查询消息列表 |
| `/msg/messages/:id` | GET | 获取单条消息 |
| `/msg/stats` | GET | 获取消息统计 |
| `/msg/messages` | DELETE | 删除指定日期前的消息 |

### 缓存管理接口

| 路径 | 方法 | 描述 |
|------|------|------|
| `/cache/files` | GET | 获取缓存文件列表 |
| `/cache/files/:path` | DELETE | 删除指定缓存文件 |

### 推送任务接口

| 路径 | 方法 | 描述 |
|------|------|------|
| `/push/jobs` | GET | 获取推送任务列表 |
| `/push/jobs/:id` | GET | 获取单个任务详情 |
| `/push/jobs/:id/execute` | POST | 立即执行任务 |
| `/push/jobs/:id/enable` | POST | 启用任务 |
| `/push/jobs/:id/disable` | POST | 禁用任务 |
| `/push/jobs/:id` | DELETE | 删除任务 |

### 推送 API

| 路径 | 方法 | 描述 |
|------|------|------|
| `/api/push/send` | POST | 发送消息到指定平台 |
| `/api/push/send/all` | POST | 广播消息到所有平台 |
| `/api/push/status` | GET | 获取推送平台状态 |

推送 API 请求体格式：

```json
{
  "token": "your-api-token",
  "platform": "wecom",
  "content": "消息内容",
  "type": "text"
}
```

## 添加新命令

1. 在 `src/actions/` 目录创建新文件
2. 实现 `IAction` 接口
3. 在 `index.ts` 中注册

```typescript
// src/actions/echo.ts
import type { IAction, StandardMessage, IAdapter } from '../core/types.js';

export class EchoAction implements IAction {
  name = 'echo';
  description = '复读用户消息';

  match(content: string): boolean {
    return content.startsWith('/echo ');
  }

  async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    const text = msg.content.replace('/echo ', '');
    await adapter.sendMessage(msg, text);
  }
}
```

## 添加新平台

1. 在 `src/adapters/` 目录创建新文件
2. 实现 `IAdapter` 接口
3. 在 `index.ts` 中初始化并连接

## 部署

### Docker 部署

```bash
# 构建镜像
docker build -t carrotbot .

# 运行容器
docker run -d --env-file .env -p 3000:3000 -v ./data:/app/data carrotbot
```

### PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/index.js --name carrotbot

# 开机自启
pm2 startup
pm2 save
```

## 注意事项

- 企业微信智能机器人需要在管理后台开启「API 模式」并选择「长连接」方式
- 长连接模式无需配置公网回调 URL，适合内网部署
- LAN 监控功能目前仅支持 TP-Link 路由器
- 媒体文件会自动下载并缓存到本地

## 许可证

Apache-2.0
