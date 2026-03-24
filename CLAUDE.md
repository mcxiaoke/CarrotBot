# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 提供在此仓库中工作的指导。

## 项目概览

CarrotBot 是一个多平台消息网关，支持企业微信和 Telegram 机器人。它提供统一的消息收发接口，支持命令执行和局域网设备监控功能。

## 核心架构

系统采用模块化适配器模式：

```
用户消息 → 适配器 → 标准消息 → 路由器 → 处理器 → 回复
     ↑                           ↓
平台适配器               命令处理器
(企业微信/Telegram)    (Ping/Help/LAN等)
```

### 关键接口

- **StandardMessage**: 系统内部统一的消息格式，包含平台、发送者、内容、消息类型、原始数据等字段
- **IAdapter**: 平台适配器必须实现 parseMessage()、sendMessage() 等方法
- **IAction**: 命令处理器必须实现 name、description、match() 和 execute() 方法

### 目录结构

- `src/core/`: 核心接口定义 (types.ts) 和消息路由器
- `src/adapters/`: 平台适配器 (wecom.ts, telegram.ts)
- `src/actions/`: 命令处理器 (ping.ts, help.ts, debug.ts, lan.ts)
- `src/lan/`: 局域网监控服务（支持 TP-Link 路由器）
- `src/services/`: 后台服务（push.ts 定时推送任务）
- `src/storage/`: SQLite 数据库和文件缓存管理
- `src/router/`: HTTP API 路由
- `src/server.ts`: Fastify HTTP 服务器配置
- `src/index.ts`: 应用程序主入口

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建 TypeScript
npm run build

# 生产环境启动
npm start
```

## 环境配置

必需的环境变量（详见 `.env.example`）：

- `WECOM_BOT_ID` + `WECOM_BOT_SECRET`: 企业微信机器人凭证
- `TELEGRAM_BOT_TOKEN`: Telegram 机器人令牌
- `PORT`: HTTP 服务端口（默认：3000）
- `DATA_PATH`: 数据存储目录（默认：./data）
- `ROUTER_IP` + `ROUTER_PASSWORD`: TP-Link 路由器配置（可选，用于局域网监控）
- `LOG_LEVEL`: 日志级别（默认：info）

可选的 Telegram 代理设置：

- `TELEGRAM_PROXY_TYPE`: http 或 socks
- `TELEGRAM_PROXY_HOST` + `TELEGRAM_PROXY_PORT`

## 添加新功能

### 添加新命令

1. 在 `src/actions/` 目录创建新文件，实现 `IAction` 接口
2. 在 `src/index.ts` 中注册：`router.register(new YourAction())`

示例：

```typescript
import type { IAction, StandardMessage, IAdapter } from '../core/types.js'

export class YourAction implements IAction {
    name = 'your-command'
    description = '命令描述说明'

    match(content: string): boolean {
        return content.startsWith('/your-command')
    }

    async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
        await adapter.sendMessage(msg, '命令执行成功！')
    }
}
```

### 添加新平台适配器

1. 在 `src/adapters/` 目录创建新文件，实现 `IAdapter` 接口
2. 在 `src/index.ts` 中初始化和连接

## API 接口

Fastify 服务器提供以下端点：

- `GET /` - 服务信息
- `GET /health` - 健康检查
- `GET /lan/devices` - 获取在线设备列表
- `GET /msg/messages` - 查询消息历史
- `POST /api/push/send` - 发送消息到指定平台
- `POST /api/push/send/all` - 广播到所有平台

## 数据库结构

SQLite 数据库位于 `${DATA_PATH}/messages.db`，存储：

- 消息历史（平台、发送者、内容、时间戳）
- 推送任务调度和配置
- 媒体文件缓存元数据

## 主要依赖

- **运行时**: Node.js v20 LTS
- **框架**: Fastify v5
- **数据库**: better-sqlite3
- **企业微信 SDK**: @wecom/aibot-node-sdk (WebSocket 模式)
- **Telegram SDK**: node-telegram-bot-api
- **开发工具**: TypeScript, tsx (热重载)

## 部署方式

### Docker 部署

```bash
docker build -t carrotbot .
docker run -d --env-file .env -p 3000:3000 -v ./data:/app/data carrotbot
```

### PM2 部署

```bash
pm2 start dist/index.js --name carrotbot
```

## 重要说明

- 企业微信需要在管理后台开启「API 模式」并选择「长连接」方式
- 局域网监控功能目前仅支持 TP-Link 路由器
- 媒体文件会自动下载并缓存在本地
- 系统支持优雅关闭（SIGINT/SIGTERM 信号处理）
- 所有平台特定逻辑都应封装在适配器中
- 命令处理器应保持平台无关性，使用 StandardMessage 格式
