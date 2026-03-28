/**
 * 推送 API 路由模块
 *
 * 本模块提供 HTTP API 接口，用于向企业微信和 Telegram 发送推送消息。
 * 支持单平台推送和全平台广播。
 */

import type { FastifyInstance } from 'fastify'
import axios from 'axios'
import TelegramBot from 'node-telegram-bot-api'
import type { Agent } from 'https'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { logger } from '../logger.js'

/** 企业微信 Webhook URL */
const WECOM_WEBHOOK_URL = process.env.WECOM_WEBHOOK_URL || ''
/** Telegram Bot Token */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
/** Telegram 目标用户 ID */
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID || ''

/** Telegram 代理配置 */
const TELEGRAM_PROXY_TYPE = process.env.TELEGRAM_PROXY_TYPE as 'http' | 'socks' | undefined
const TELEGRAM_PROXY_HOST = process.env.TELEGRAM_PROXY_HOST || ''
const TELEGRAM_PROXY_PORT = parseInt(process.env.TELEGRAM_PROXY_PORT || '0', 10)

/** 支持的平台类型 */
type Platform = 'wecom' | 'telegram'
/** 支持的内容类型 */
type ContentType = 'text' | 'markdown'

/**
 * 推送请求接口
 */
interface PushRequest {
    /** 目标平台 */
    platform: Platform
    /** 消息内容 */
    content: string
    /** 内容类型，默认 text */
    type?: ContentType
}

/**
 * 通过企业微信 Webhook 发送消息
 *
 * @param content - 消息内容
 * @param type - 内容类型
 */
async function sendWecomWebhook(content: string, type: ContentType): Promise<void> {
    if (!WECOM_WEBHOOK_URL) {
        throw new Error('WECOM_WEBHOOK_URL not configured')
    }

    // 根据类型构建消息体
    const msgType = type === 'markdown' ? 'markdown' : 'text'
    const body =
        type === 'markdown'
            ? { msgtype: 'markdown', markdown: { content } }
            : { msgtype: 'text', text: { content } }

    logger.debug({ msgType, contentLength: content.length }, 'Sending WeCom webhook message')

    const response = await axios.post(WECOM_WEBHOOK_URL, body)

    // 检查响应错误码
    if (response.data?.errcode !== 0) {
        throw new Error(`WeCom webhook error: ${response.data?.errmsg || 'Unknown error'}`)
    }

    logger.info({ type, contentLength: content.length }, 'WeCom webhook message sent')
}

/**
 * 通过 Telegram Bot 发送消息
 *
 * @param content - 消息内容
 * @param type - 内容类型
 */
async function sendTelegramMessage(content: string, type: ContentType): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN not configured')
    }
    if (!TELEGRAM_USER_ID) {
        throw new Error('TELEGRAM_USER_ID not configured')
    }

    const options: TelegramBot.ConstructorOptions = {}
    let proxyAgent: Agent | undefined

    // 配置代理（如果提供）
    if (TELEGRAM_PROXY_TYPE && TELEGRAM_PROXY_HOST && TELEGRAM_PROXY_PORT) {
        const proxyUrl =
            TELEGRAM_PROXY_TYPE === 'socks'
                ? `socks5://${TELEGRAM_PROXY_HOST}:${TELEGRAM_PROXY_PORT}`
                : `http://${TELEGRAM_PROXY_HOST}:${TELEGRAM_PROXY_PORT}`

        options.request = {
            proxy: proxyUrl
        } as any

        proxyAgent =
            TELEGRAM_PROXY_TYPE === 'socks'
                ? new SocksProxyAgent(proxyUrl)
                : new HttpsProxyAgent(proxyUrl)

        logger.debug(
            { type: TELEGRAM_PROXY_TYPE, host: TELEGRAM_PROXY_HOST, port: TELEGRAM_PROXY_PORT },
            'Telegram using proxy'
        )
    }

    const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, options)
    const chatId = parseInt(TELEGRAM_USER_ID, 10)

    logger.debug({ type, chatId, contentLength: content.length }, 'Sending Telegram message')

    // 根据类型发送消息
    if (type === 'markdown') {
        await bot.sendMessage(chatId, content, { parse_mode: 'MarkdownV2' })
    } else {
        await bot.sendMessage(chatId, content)
    }

    logger.info({ type, chatId, contentLength: content.length }, 'Telegram message sent')
}

/**
 * 注册推送 API 路由
 *
 * @param fastify - Fastify 实例
 */
export async function registerPushApiRoutes(fastify: FastifyInstance): Promise<void> {
    /**
     * 发送消息到指定平台
     *
     * POST /api/push/send
     * 请求体: { platform, content, type }
     */
    fastify.post<{ Body: PushRequest }>('/send', async (request, reply) => {
        const { platform, content, type = 'text' } = request.body

        logger.info({ ip: request.ip, platform, type }, 'Push API request received')

        if (!content || content.trim().length === 0) {
            logger.warn({ ip: request.ip }, 'Content is empty')
            return reply.code(400).send({ success: false, error: 'Content is required' })
        }

        if (!['wecom', 'telegram'].includes(platform)) {
            logger.warn({ ip: request.ip, platform }, 'Invalid platform')
            return reply
                .code(400)
                .send({ success: false, error: 'Invalid platform. Use "wecom" or "telegram"' })
        }

        if (!['text', 'markdown'].includes(type)) {
            logger.warn({ ip: request.ip, type }, 'Invalid content type')
            return reply
                .code(400)
                .send({ success: false, error: 'Invalid type. Use "text" or "markdown"' })
        }

        try {
            logger.debug({ platform, type, contentLength: content.length }, 'Sending push message')

            if (platform === 'wecom') {
                await sendWecomWebhook(content, type)
            } else if (platform === 'telegram') {
                await sendTelegramMessage(content, type)
            }

            logger.info(
                { platform, type, contentLength: content.length },
                'Push message sent successfully'
            )
            return { success: true, platform, type }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            logger.error({ err: errorMessage, platform, type }, 'Push API send failed')
            return reply.code(500).send({ success: false, error: errorMessage })
        }
    })

    /**
     * 广播消息到所有平台
     *
     * POST /api/push/send/all
     * 请求体: { content, type }
     */
    fastify.post<{ Body: PushRequest }>('/send/all', async (request, reply) => {
        const { content, type = 'text' } = request.body

        logger.info({ ip: request.ip, type }, 'Push API broadcast request received')

        if (!content || content.trim().length === 0) {
            logger.warn({ ip: request.ip }, 'Content is empty')
            return reply.code(400).send({ success: false, error: 'Content is required' })
        }

        const results: { platform: string; success: boolean; error?: string }[] = []

        if (WECOM_WEBHOOK_URL) {
            try {
                logger.debug({ type, contentLength: content.length }, 'Sending to WeCom')
                await sendWecomWebhook(content, type)
                results.push({ platform: 'wecom', success: true })
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error'
                logger.error({ err: errorMessage, platform: 'wecom' }, 'Failed to send to WeCom')
                results.push({ platform: 'wecom', success: false, error: errorMessage })
            }
        }

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_USER_ID) {
            try {
                logger.debug({ type, contentLength: content.length }, 'Sending to Telegram')
                await sendTelegramMessage(content, type)
                results.push({ platform: 'telegram', success: true })
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error'
                logger.error(
                    { err: errorMessage, platform: 'telegram' },
                    'Failed to send to Telegram'
                )
                results.push({ platform: 'telegram', success: false, error: errorMessage })
            }
        }

        const allSuccess = results.length > 0 && results.every((r) => r.success)

        logger.info({ results, allSuccess }, 'Broadcast completed')

        return {
            success: allSuccess,
            results
        }
    })

    /**
     * 获取推送平台状态
     *
     * GET /api/push/status
     */
    fastify.get('/status', async () => {
        logger.debug('Push API status requested')
        return {
            success: true,
            platforms: {
                wecom: {
                    available: !!WECOM_WEBHOOK_URL,
                    type: 'webhook'
                },
                telegram: {
                    available: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_USER_ID),
                    type: 'bot'
                }
            }
        }
    })
}
