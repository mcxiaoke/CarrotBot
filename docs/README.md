# CarrotBot - 统一消息网关

个人部署的消息推送接收和命令执行服务，支持多平台扩展。

## 技术栈

- **Runtime**: Node.js v20 LTS
- **Language**: TypeScript
- **Framework**: Fastify
- **WeCom SDK**: @wecom/aibot-node-sdk (WebSocket 长连接模式)
- **Logging**: Pino

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
  platform: string;      // 'wecom' | 'telegram'
  from: string;          // 发送者/会话 ID
  content: string;       // 消息文本内容
  raw: unknown;          // 原始数据（按需使用）
}

// 平台适配器接口
interface IAdapter {
  readonly platform: string;
  parseMessage(raw: unknown): StandardMessage;
  sendMessage(to: string, content: string): Promise<void>;
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
├── core/
│   ├── types.ts          # 核心接口定义
│   └── router.ts         # 消息路由分发器
├── adapters/
│   ├── base.ts           # 适配器基类
│   ├── wecom.ts          # 企业微信适配器
│   └── telegram.ts       # Telegram 适配器（后期扩展）
├── actions/
│   ├── ping.ts           # /ping 命令
│   └── help.ts           # /help 命令
├── server.ts             # Fastify 服务入口
└── index.ts              # 主入口
```

## 环境变量

```env
# 企业微信智能机器人
WECOM_BOT_ID=your-bot-id
WECOM_BOT_SECRET=your-bot-secret

# Telegram Bot (可选)
TELEGRAM_BOT_TOKEN=your-bot-token

# 服务端口
PORT=3000
```

## 开发步骤

### 阶段一：基础框架
1. 初始化项目 (package.json, tsconfig.json)
2. 定义核心类型 (StandardMessage, IAdapter, IAction)
3. 实现 MessageRouter
4. 实现 PingAction / HelpAction

### 阶段二：企业微信接入
1. 实现 WeComAdapter (使用 @wecom/aibot-node-sdk)
2. 连接 WebSocket，监听消息
3. 测试消息收发

### 阶段三：扩展功能
1. 添加自定义 Actions
2. 接入 Telegram（按需）
3. Docker 部署

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 生产运行
npm start
```

## 添加新命令

1. 在 `src/actions/` 创建新文件
2. 实现 IAction 接口
3. 在 router 中注册

```typescript
// src/actions/echo.ts
import type { IAction, StandardMessage, IAdapter } from '../core/types';

export class EchoAction implements IAction {
  name = 'echo';
  description = '复读用户消息';

  match(content: string): boolean {
    return content.startsWith('/echo ');
  }

  async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    const text = msg.content.replace('/echo ', '');
    await adapter.sendMessage(msg.from, text);
  }
}
```

## 添加新平台

1. 在 `src/adapters/` 创建新文件
2. 实现 IAdapter 接口
3. 在 server.ts 中初始化并连接

## 部署

```bash
# Docker 构建
docker build -t carrotbot .

# Docker 运行
docker run -d --env-file .env -p 3000:3000 carrotbot
```

## 注意事项

- 企业微信智能机器人需要在管理后台开启「API 模式」并选择「长连接」方式
- 长连接模式无需配置公网回调 URL，适合内网部署
- 同一会话的回复消息会自动串行发送，无需手动管理队列
