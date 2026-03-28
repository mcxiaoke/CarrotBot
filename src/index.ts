/**
 * CarrotBot 主入口模块
 *
 * 本模块是应用程序的入口点，负责：
 * - 初始化消息存储
 * - 创建消息路由器
 * - 注册命令处理器
 * - 初始化 LAN 服务
 * - 连接平台适配器
 * - 启动 HTTP 服务器
 * - 处理优雅关闭
 */

import dotenv from 'dotenv'
import { createServer } from './server.js'
import { MessageRouter } from './core/router.js'
import { WeComAdapter } from './adapters/wecom.js'
import { TelegramAdapter } from './adapters/telegram.js'
import { PingAction } from './actions/ping.js'
import { HelpAction } from './actions/help.js'
import { DebugAction } from './actions/debug.js'
import { LanAction } from './actions/lan.js'
import { initLanService } from './lan/service.js'
import { initMessageStore, closeMessageStore } from './storage/message-store.js'
import { pushService } from './services/push.js'
import { logger } from './logger.js'

// 加载 .env 文件（如果存在）
dotenv.config()

// 从环境变量读取配置
const PORT = parseInt(process.env.PORT || '3123', 10)
const ROUTER_IP = process.env.ROUTER_IP || ''
const ROUTER_PASSWORD = process.env.ROUTER_PASSWORD || ''
const DATA_PATH = process.env.DATA_PATH || './data'
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
const WECOM_BOT_NAME = process.env.WECOM_BOT_NAME || ''

// 平台启用标志
const WECOM_ENABLED = process.env.WECOM_ENABLED !== 'false'
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED !== 'false'

// Telegram 代理配置
const TELEGRAM_PROXY_TYPE = process.env.TELEGRAM_PROXY_TYPE as 'http' | 'socks' | undefined
const TELEGRAM_PROXY_HOST = process.env.TELEGRAM_PROXY_HOST || ''
const TELEGRAM_PROXY_PORT = parseInt(process.env.TELEGRAM_PROXY_PORT || '0', 10)

/**
 * 主函数
 *
 * 执行应用程序的初始化和启动流程
 */
async function main() {
    // 0. 检查必要的环境变量
    const wecomBotId = process.env.WECOM_BOT_ID || ''
    const wecomBotSecret = process.env.WECOM_BOT_SECRET || ''
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN || ''

    if (!wecomBotId && !wecomBotSecret && !telegramToken) {
        logger.error('Missing required environment variables!')
        logger.error('Please set at least one of:')
        logger.error('  - WECOM_BOT_ID and WECOM_BOT_SECRET (企业微信)')
        logger.error('  - TELEGRAM_BOT_TOKEN (Telegram)')
        logger.error('Hint: Check if .env file exists and is properly configured')
        process.exit(1)
    }

    // 1. 初始化消息存储
    initMessageStore({
        dbPath: `${DATA_PATH}/messages.db`,
        cachePath: `${DATA_PATH}/cache`
    })
    logger.info('MessageStore initialized')

    // 2. 创建消息路由器并注册命令处理器
    const router = new MessageRouter()
    router.register(new PingAction())
    router.register(new HelpAction(router))
    router.register(new LanAction())
    if (LOG_LEVEL === 'debug') {
        router.setDefault(new DebugAction())
    }

    // 3. 初始化 LAN 服务（如果配置了路由器）
    if (ROUTER_IP && ROUTER_PASSWORD) {
        await initLanService({
            routerIp: ROUTER_IP,
            routerPassword: ROUTER_PASSWORD,
            refreshInterval: 20_000 // 每 20 秒刷新一次设备列表
        })
        logger.info('LAN Service initialized')
    } else {
        logger.warn('LAN Service disabled: ROUTER_IP or ROUTER_PASSWORD not set')
    }

    // 4. 初始化平台适配器
    const adapters: { name: string; adapter: WeComAdapter | TelegramAdapter }[] = []

    // 4.1 初始化企业微信适配器
    if (WECOM_ENABLED && wecomBotId && wecomBotSecret) {
        const wecomAdapter = new WeComAdapter({
            botId: wecomBotId,
            botSecret: wecomBotSecret,
            botName: WECOM_BOT_NAME || undefined
        })

        // 设置消息处理回调
        wecomAdapter.setMessageHandler((msg) => {
            router.dispatch(msg, wecomAdapter)
        })

        wecomAdapter.connect()
        adapters.push({ name: 'wecom', adapter: wecomAdapter })
        logger.info('WeCom adapter connected')
    } else if (!WECOM_ENABLED) {
        logger.info('WeCom adapter disabled by WECOM_ENABLED=false')
    } else {
        logger.warn('WeCom adapter disabled: WECOM_BOT_ID or WECOM_BOT_SECRET not set')
    }

    // 4.2 初始化 Telegram 适配器
    if (TELEGRAM_ENABLED && telegramToken) {
        // 配置代理（如果提供）
        const proxyConfig =
            TELEGRAM_PROXY_TYPE && TELEGRAM_PROXY_HOST && TELEGRAM_PROXY_PORT
                ? {
                      type: TELEGRAM_PROXY_TYPE,
                      host: TELEGRAM_PROXY_HOST,
                      port: TELEGRAM_PROXY_PORT
                  }
                : undefined

        const telegramAdapter = new TelegramAdapter({
            token: telegramToken,
            proxy: proxyConfig
        })

        // 设置消息处理回调
        telegramAdapter.setMessageHandler((msg) => {
            router.dispatch(msg, telegramAdapter)
        })

        telegramAdapter.connect()
        adapters.push({ name: 'telegram', adapter: telegramAdapter })
        logger.info('Telegram adapter connected')
    } else if (!TELEGRAM_ENABLED) {
        logger.info('Telegram adapter disabled by TELEGRAM_ENABLED=false')
    } else {
        logger.warn('Telegram adapter disabled: TELEGRAM_BOT_TOKEN not set')
    }

    // 5. 启动 HTTP 服务器
    const fastify = await createServer()

    // 6. 注册优雅关闭处理
    const shutdown = () => {
        logger.info('Shutting down...')

        // 停止推送服务
        pushService.stop()

        // 断开所有平台适配器
        for (const { name, adapter } of adapters) {
            adapter.disconnect()
            logger.info(`${name} adapter disconnected`)
        }

        // 关闭消息存储
        closeMessageStore()

        // 关闭 HTTP 服务器
        fastify.close().then(() => {
            process.exit(0)
        })
    }

    // 监听终止信号
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // 7. 开始监听端口
    await fastify.listen({ port: PORT, host: '0.0.0.0' })
    logger.info(`Server running on http://0.0.0.0:${PORT}`)
}

// 启动应用程序
main().catch((err) => {
    logger.error(err, 'Failed to start server')
    process.exit(1)
})
