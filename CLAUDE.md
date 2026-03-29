# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 提供在此仓库中工作的指导。

## 项目概览

CarrotBot 是一个多平台消息网关，支持企业微信和 Telegram 机器人。它提供统一的消息收发接口，支持命令执行和局域网设备监控功能。

## 核心架构

系统采用模块化适配器模式，将不同平台的消息转换为统一格式进行处理。用户消息通过适配器转换为标准消息，然后由路由器分发给对应的命令处理器，最后通过适配器回复用户。

### 关键接口

- **StandardMessage**: 系统内部统一的消息格式，包含平台、发送者、内容、消息类型、原始数据等字段
- **IAdapter**: 平台适配器必须实现 parseMessage()、sendMessage() 等方法
- **IAction**: 命令处理器必须实现 name、description、match() 和 execute() 方法

### 目录结构

- `src/core/`: 核心接口定义和消息路由器
- `src/adapters/`: 平台适配器（企业微信和 Telegram）
- `src/actions/`: 命令处理器（ping、help、debug、lan）
- `src/lan/`: 局域网监控服务（支持 TP-Link 路由器）
- `src/services/`: 后台服务（推送任务）
- `src/websocket/`: WebSocket 消息转发服务
- `src/storage/`: SQLite 数据库和文件缓存管理
- `src/router/`: HTTP API 路由
- `src/utils/`: 工具模块（重试机制）
- `src/templates/`: HTML 管理页面模板
- `src/auth.ts`: API 认证相关功能
- `src/server.ts`: Fastify HTTP 服务器配置
- `src/index.ts`: 应用程序主入口
- `src/logger.ts`: 日志模块

## 开发命令

- 安装依赖：npm install
- 开发模式（热重载）：npm run dev
- 构建 TypeScript：npm run build
- 生产环境启动：npm start
- 代码检查：npm run lint
- 代码自动修复：npm run lint:fix
- 代码格式化：npm run prettier:fix
- 完整检查（lint + 构建）：npm run check

## 环境配置

必需的环境变量：

- `WECOM_BOT_ID` + `WECOM_BOT_SECRET`: 企业微信机器人凭证
- `TELEGRAM_BOT_TOKEN`: Telegram 机器人令牌
- `API_TOKEN`: API 接口认证令牌（重要）
- `PORT`: HTTP 服务端口（默认：3123）
- `DATA_PATH`: 数据存储目录（默认：./data）
- `ROUTER_IP` + `ROUTER_PASSWORD`: TP-Link 路由器配置（可选，用于局域网监控）
- `LOG_LEVEL`: 日志级别（默认：info）

平台启用控制：

- `WECOM_ENABLED`: 是否启用企业微信（默认：true）
- `TELEGRAM_ENABLED`: 是否启用 Telegram（默认：true）

可选的 Telegram 代理设置：

- `TELEGRAM_PROXY_TYPE`: http 或 socks
- `TELEGRAM_PROXY_HOST` + `TELEGRAM_PROXY_PORT`

WebSocket 服务配置：

- `WS_ENABLED`: 是否启用 WebSocket 服务（默认：true）
- `WS_CACHE_DURATION`: 消息缓存时间毫秒数（默认：300000，即 5 分钟）
- `WS_HEARTBEAT_INTERVAL`: 心跳检测间隔毫秒数（默认：30000，即 30 秒）
- `WS_HEARTBEAT_TIMEOUT`: 心跳超时时间毫秒数（默认：60000，即 60 秒）

## 添加新功能

### 添加新命令

1. 在 `src/actions/` 目录创建新文件，实现 `IAction` 接口
2. 在 `src/index.ts` 中注册：`router.register(new YourAction())`

### 添加新平台适配器

1. 在 `src/adapters/` 目录创建新文件，实现 `IAdapter` 接口
2. 在 `src/index.ts` 中初始化和连接

## API 接口

Fastify 服务器提供以下端点，大部分 API 需要 token 认证：

公开接口：

- `GET /` - 服务信息
- `GET /health` - 健康检查

管理页面：

- `GET /admin/messages` - 消息查看页面
- `GET /admin/send` - 消息发送页面

API 接口（需要认证）：

- `GET /api/docs` - 获取 API 接口文档列表
- `GET /api/lan/devices` - 获取在线设备列表
- `GET /api/lan/query` - 查询设备状态
- `GET /api/lan/status` - 获取局域网服务状态
- `GET /api/msg/messages` - 查询消息列表（支持分页和筛选）
- `GET /api/msg/messages/:id` - 获取单条消息详情
- `GET /api/msg/stats` - 获取消息统计
- `GET /api/msg/actions` - 查询命令消息列表
- `DELETE /api/msg/messages` - 删除指定日期前的消息
- `GET /api/cache/files` - 获取缓存文件列表
- `DELETE /api/cache/files` - 清理指定日期前的缓存文件
- `DELETE /api/cache/files/:path` - 删除指定缓存文件
- `GET /api/push/jobs` - 获取推送任务列表
- `GET /api/push/jobs/:id` - 获取单个推送任务详情
- `POST /api/push/jobs/:id/execute` - 立即执行指定推送任务
- `POST /api/push/jobs/:id/enable` - 启用指定推送任务
- `POST /api/push/jobs/:id/disable` - 禁用指定推送任务
- `DELETE /api/push/jobs/:id` - 删除指定推送任务
- `POST /api/push/send` - 发送消息到指定平台
- `POST /api/push/send/all` - 广播消息到所有平台
- `GET /api/push/status` - 获取推送平台配置状态

WebSocket 接口：

- `WS /ws` - WebSocket 连接端点，实时接收消息
- `GET /api/ws/status` - 获取 WebSocket 服务状态

认证方式：

- GET/DELETE 请求：通过 query 参数传递 token (?token=xxx)
- POST 请求：通过 body 传递 token ({ token: "xxx", ... })

## 数据库结构

SQLite 数据库位于 `${DATA_PATH}/messages.db`，存储：

- 消息历史（平台、发送者、内容、时间戳、消息类型、方向）
- 推送任务调度和配置
- 媒体文件缓存元数据

## 主要依赖

- **运行时**: Node.js v20 LTS
- **框架**: Fastify v5
- **数据库**: better-sqlite3
- **企业微信 SDK**: @wecom/aibot-node-sdk (WebSocket 模式)
- **Telegram SDK**: node-telegram-bot-api
- **WebSocket**: ws
- **开发工具**: TypeScript, tsx (热重载)
- **代码质量**: ESLint, Prettier

## 部署方式

### Docker 部署

构建镜像并运行容器，注意映射数据目录和环境变量文件。

### PM2 部署

使用 PM2 进程管理器启动服务，支持开机自启。

## 重要说明

- 企业微信需要在管理后台开启「API 模式」并选择「长连接」方式
- 局域网监控功能目前仅支持 TP-Link 路由器
- 媒体文件会自动下载并缓存在本地
- 系统支持优雅关闭（SIGINT/SIGTERM 信号处理）
- 所有平台特定逻辑都应封装在适配器中
- 命令处理器应保持平台无关性，使用 StandardMessage 格式
- API 接口需要配置 API_TOKEN 进行认证
