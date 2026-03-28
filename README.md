# CarrotBot - 统一消息网关

CarrotBot 是一个支持多平台的消息推送接收和命令执行服务，支持企业微信和 Telegram 两大平台，可轻松扩展更多平台适配器。

## 功能特性

- 多平台支持：支持企业微信智能机器人和 Telegram Bot，可分别启用或禁用
- 消息路由：基于命令的消息路由分发系统
- 消息存储：SQLite 数据库存储消息历史记录
- 媒体缓存：自动下载和缓存消息中的媒体文件
- 局域网监控：支持 TP-Link 路由器局域网设备在线状态监控
- 推送服务：提供 HTTP API 用于消息推送
- 代理支持：Telegram 支持 HTTP/SOCKS5 代理
- Web 管理界面：提供消息查看和发送的 HTML 页面
- API 认证：通过 token 保护 API 接口安全
- 代码质量工具：集成 ESLint 和 Prettier

## 技术栈

- 运行时：Node.js v20 LTS
- 语言：TypeScript
- Web 框架：Fastify v5
- 企业微信 SDK：@wecom/aibot-node-sdk（WebSocket 长连接模式）
- 数据库：better-sqlite3
- Telegram SDK：node-telegram-bot-api
- 工具库：axios（HTTP 客户端）、dayjs（日期处理）
- 代码质量：ESLint、Prettier

## 核心架构

系统采用模块化适配器模式，将不同平台的消息转换为统一格式进行处理。用户消息通过适配器转换为标准消息，然后由路由器分发给对应的命令处理器，最后通过适配器回复用户。

### 核心接口

- StandardMessage：系统内部统一的消息格式，包含平台、发送者、内容、消息类型、原始数据等字段
- IAdapter：平台适配器接口，定义消息解析和发送方法
- IAction：命令处理器接口，定义命令名称、描述、匹配和执行方法

## 目录结构

- src/core/：核心模块，包含接口定义和消息路由器
- src/adapters/：平台适配器，企业微信和 Telegram 实现
- src/actions/：命令处理器，包括 ping、help、debug、lan 等命令
- src/lan/：局域网监控模块，设备信息类和 TP-Link 路由器接口
- src/services/：业务服务，推送任务服务
- src/router/：API 路由，推送和管理接口
- src/storage/：存储层，SQLite 数据库和文件缓存管理
- src/utils/：工具模块，重试机制
- src/templates/：HTML 模板，消息查看和发送页面
- src/auth.ts：认证相关功能
- src/logger.ts：日志模块
- src/index.ts：主入口
- src/server.ts：Fastify HTTP 服务

## 环境变量配置

创建 .env 文件并配置以下环境变量：

企业微信智能机器人配置：
- WECOM_BOT_ID：企业微信机器人 ID
- WECOM_BOT_SECRET：企业微信机器人密钥
- WECOM_ENABLED：是否启用企业微信，默认 true

Telegram 机器人配置：
- TELEGRAM_BOT_TOKEN：Telegram 机器人令牌
- TELEGRAM_ENABLED：是否启用 Telegram，默认 true

Telegram 代理配置（可选）：
- TELEGRAM_PROXY_TYPE：代理类型，http 或 socks
- TELEGRAM_PROXY_HOST：代理服务器地址
- TELEGRAM_PROXY_PORT：代理服务器端口

服务配置：
- PORT：服务端口，默认 3123
- API_TOKEN：API 接口认证令牌，重要
- DATA_PATH：数据存储路径，默认 ./data
- LOG_LEVEL：日志级别，可选 trace/debug/info/warn/error，默认 info

路由器配置（可选，用于局域网设备监控）：
- ROUTER_IP：路由器 IP 地址
- ROUTER_PASSWORD：路由器密码

## 快速开始

安装依赖：npm install

开发模式（热重载）：npm run dev

构建：npm run build

生产运行：npm start

代码检查：npm run lint

代码自动修复：npm run lint:fix

代码格式化：npm run prettier:fix

完整检查（lint + 构建）：npm run check

## 内置命令

- /ping：检查服务运行状态，显示运行时间和内存使用
- /help：显示所有可用命令的帮助信息
- /lan：显示局域网在线设备列表，需配置路由器
- /debug：显示消息详情，仅在 LOG_LEVEL=debug 时可用

## HTTP API 接口

大部分 API 需要 token 认证，认证方式：
- GET/DELETE 请求：通过 query 参数传递 token (?token=xxx)
- POST 请求：通过 body 传递 token ({ token: "xxx", ... })

公开接口：
- GET /：服务信息
- GET /health：健康检查

管理页面：
- GET /admin/messages：消息查看页面
- GET /admin/send：消息发送页面

API 文档：
- GET /api/docs：获取所有 API 接口文档列表

局域网设备接口：
- GET /api/lan/devices：获取在线设备列表
- GET /api/lan/query：查询设备状态，支持 mac 和 ip 参数
- GET /api/lan/status：获取局域网服务状态

消息管理接口：
- GET /api/msg/messages：查询消息列表，支持分页和多种筛选条件
- GET /api/msg/messages/:id：获取单条消息详情
- GET /api/msg/stats：获取消息统计
- GET /api/msg/actions：查询命令消息列表
- DELETE /api/msg/messages：删除指定日期前的消息

缓存管理接口：
- GET /api/cache/files：获取缓存文件列表
- DELETE /api/cache/files：清理指定日期前的缓存文件
- DELETE /api/cache/files/:path：删除指定缓存文件

推送任务接口：
- GET /api/push/jobs：获取推送任务列表
- GET /api/push/jobs/:id：获取单个推送任务详情
- POST /api/push/jobs/:id/execute：立即执行指定推送任务
- POST /api/push/jobs/:id/enable：启用指定推送任务
- POST /api/push/jobs/:id/disable：禁用指定推送任务
- DELETE /api/push/jobs/:id：删除指定推送任务

推送发送接口：
- POST /api/push/send：发送消息到指定平台
- POST /api/push/send/all：广播消息到所有平台
- GET /api/push/status：获取推送平台配置状态

## 添加新命令

1. 在 src/actions/ 目录创建新文件，实现 IAction 接口
2. 在 src/index.ts 中注册

## 添加新平台

1. 在 src/adapters/ 目录创建新文件，实现 IAdapter 接口
2. 在 src/index.ts 中初始化并连接

## 部署

### Docker 部署

构建镜像，然后运行容器，注意映射数据目录和环境变量文件。

### PM2 部署

安装 PM2，然后使用 PM2 启动服务，支持开机自启。

## 注意事项

- 企业微信智能机器人需要在管理后台开启 API 模式并选择长连接方式
- 长连接模式无需配置公网回调 URL，适合内网部署
- 局域网监控功能目前仅支持 TP-Link 路由器
- 媒体文件会自动下载并缓存到本地
- 系统支持优雅关闭（SIGINT/SIGTERM 信号处理）
- API 接口需要配置 API_TOKEN 进行认证

## 许可证

Apache-2.0
