/**
 * 推送 API 路由模块
 *
 * 本模块提供 HTTP API 接口，用于向企业微信和 Telegram 发送推送消息。
 * 企业微信和 Telegram 分开实现，支持多种消息类型。
 *
 * ## 支持的消息类型
 *
 * | 类型 | 企业微信 | Telegram | 说明 |
 * |------|---------|----------|------|
 * | text | ✓ | ✓ | 纯文本消息 |
 * | markdown | ✓ | ✓ | Markdown格式消息 |
 * | image | ✓ | ✓ | 图片消息 |
 * | file | ✓ | ✓ | 文件消息（Telegram为document） |
 * | news | ✓ | ✗ | 图文消息（仅企业微信） |
 *
 * ## 路由端点
 *
 * - POST /api/push/send - 发送消息到指定平台
 * - POST /api/push/send/all - 广播消息到所有平台
 * - GET /api/push/status - 获取平台可用状态
 * - POST /api/push/wecom/upload - 上传文件到企业微信获取media_id
 *
 * ## 环境变量配置
 *
 * 企业微信:
 * - WECOM_WEBHOOK_URL: 企业微信机器人Webhook地址
 *
 * Telegram:
 * - TELEGRAM_BOT_TOKEN: Telegram Bot Token
 * - TELEGRAM_USER_ID: 接收消息的用户/群组ID
 * - TELEGRAM_PROXY_TYPE: 代理类型 (http/socks)
 * - TELEGRAM_PROXY_HOST: 代理主机
 * - TELEGRAM_PROXY_PORT: 代理端口
 *
 * ## 文件大小限制
 *
 * 企业微信:
 * - 图片: 2MB（超过自动转为文件发送，最大20MB）
 * - 文件: 20MB
 *
 * Telegram:
 * - 图片: 10MB
 * - 文件: 50MB
 */

import type { FastifyInstance } from 'fastify'
import axios from 'axios'
import TelegramBot from 'node-telegram-bot-api'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { logger } from '../logger.js'

const WECOM_WEBHOOK_URL = process.env.WECOM_WEBHOOK_URL || ''
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID || ''

const TELEGRAM_PROXY_TYPE = process.env.TELEGRAM_PROXY_TYPE as 'http' | 'socks' | undefined
const TELEGRAM_PROXY_HOST = process.env.TELEGRAM_PROXY_HOST || ''
const TELEGRAM_PROXY_PORT = parseInt(process.env.TELEGRAM_PROXY_PORT || '0', 10)

type Platform = 'wecom' | 'telegram'

export type WecomMessageType = 'text' | 'markdown' | 'image' | 'news' | 'file'
export type TelegramMessageType = 'text' | 'markdown' | 'image' | 'document' | 'file'

/**
 * 企业微信文本消息
 */
export interface WecomTextMessage {
    type: 'text'
    content: string
    mentionedList?: string[]
    mentionedMobileList?: string[]
}

/**
 * 企业微信Markdown消息
 */
export interface WecomMarkdownMessage {
    type: 'markdown'
    content: string
}

/**
 * 企业微信图片消息
 * 图片大小限制: 2MB，支持JPG/PNG格式
 */
export interface WecomImageMessage {
    type: 'image'
    base64: string
    md5: string
}

/**
 * 企业微信图文消息文章
 */
export interface WecomNewsArticle {
    title: string
    description?: string
    url: string
    picurl?: string
}

/**
 * 企业微信图文消息
 * 支持1-8篇文章
 */
export interface WecomNewsMessage {
    type: 'news'
    articles: WecomNewsArticle[]
}

/**
 * 企业微信文件消息
 * 需要先上传文件获取media_id
 */
export interface WecomFileMessage {
    type: 'file'
    mediaId: string
}

export type WecomMessage =
    | WecomTextMessage
    | WecomMarkdownMessage
    | WecomImageMessage
    | WecomNewsMessage
    | WecomFileMessage

/**
 * Telegram文本消息
 */
export interface TelegramTextMessage {
    type: 'text'
    content: string
    parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
}

/**
 * Telegram图片消息
 */
export interface TelegramImageMessage {
    type: 'image'
    photo: string | Buffer
    caption?: string
}

/**
 * Telegram文档消息
 */
export interface TelegramDocumentMessage {
    type: 'document'
    document: string | Buffer | fs.ReadStream
    filename?: string
    caption?: string
}

export type TelegramMessage = TelegramTextMessage | TelegramImageMessage | TelegramDocumentMessage

/**
 * 推送请求体
 */
interface PushRequest {
    platform: Platform
    content: string
    type?: WecomMessageType | TelegramMessageType
    msgtype?: WecomMessageType | TelegramMessageType
    filename?: string
    token?: string
    parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
    mentionedList?: string[]
    mentionedMobileList?: string[]
    articles?: WecomNewsArticle[]
    mediaId?: string
    caption?: string
}

/**
 * 检查字符串是否为URL
 */
function isUrl(str: string): boolean {
    return str.startsWith('http://') || str.startsWith('https://')
}

/**
 * 检查字符串是否为Base64编码
 */
function isBase64(str: string): boolean {
    if (str.startsWith('data:')) {
        return true
    }
    try {
        return Buffer.from(str, 'base64').toString('base64') === str
    } catch {
        return false
    }
}

/**
 * 解析Base64数据URL
 * 支持带MIME类型的data URL格式
 */
function parseBase64Data(dataUrl: string): { buffer: Buffer; mimeType: string } {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (matches) {
        return {
            mimeType: matches[1],
            buffer: Buffer.from(matches[2], 'base64')
        }
    }
    return {
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(dataUrl, 'base64')
    }
}

/**
 * 企业微信推送器
 *
 * 通过Webhook发送消息到企业微信群机器人
 * 支持文本、Markdown、图片、图文、文件等消息类型
 */
class WecomPusher {
    private webhookUrl: string

    constructor(webhookUrl: string) {
        this.webhookUrl = webhookUrl
    }

    /**
     * 发送文本消息
     * 支持通过mentionedList和mentionedMobileList @群成员
     */
    async sendText(message: WecomTextMessage): Promise<void> {
        logger.debug(
            { type: 'text', contentLength: message.content.length },
            'WeCom: Preparing text message'
        )
        const body = {
            msgtype: 'text',
            text: {
                content: message.content,
                mentioned_list: message.mentionedList,
                mentioned_mobile_list: message.mentionedMobileList
            }
        }
        await this.sendRequest(body)
    }

    /**
     * 发送Markdown消息
     * 支持标题、加粗、链接、代码、引用、颜色文本
     */
    async sendMarkdown(message: WecomMarkdownMessage): Promise<void> {
        logger.debug(
            { type: 'markdown', contentLength: message.content.length },
            'WeCom: Preparing markdown message'
        )
        const body = {
            msgtype: 'markdown',
            markdown: {
                content: message.content
            }
        }
        await this.sendRequest(body)
    }

    /**
     * 发送图片消息
     * 图片大小限制: 2MB，支持JPG/PNG格式
     */
    async sendImage(message: WecomImageMessage): Promise<void> {
        logger.debug(
            { type: 'image', base64Length: message.base64.length, md5: message.md5 },
            'WeCom: Preparing image message'
        )
        const body = {
            msgtype: 'image',
            image: {
                base64: message.base64,
                md5: message.md5
            }
        }
        await this.sendRequest(body)
    }

    /**
     * 发送图文消息
     * 支持1-8篇文章
     */
    async sendNews(message: WecomNewsMessage): Promise<void> {
        logger.debug(
            { type: 'news', articleCount: message.articles.length },
            'WeCom: Preparing news message'
        )
        const body = {
            msgtype: 'news',
            news: {
                articles: message.articles
            }
        }
        await this.sendRequest(body)
    }

    /**
     * 发送文件消息
     * 需要先通过uploadMedia获取media_id
     */
    async sendFile(message: WecomFileMessage): Promise<void> {
        logger.debug({ type: 'file', mediaId: message.mediaId }, 'WeCom: Preparing file message')
        const body = {
            msgtype: 'file',
            file: {
                media_id: message.mediaId
            }
        }
        await this.sendRequest(body)
    }

    /**
     * 上传媒体文件到企业微信
     *
     * @param fileBuffer 文件Buffer
     * @param filename 文件名
     * @param type 文件类型: file(20MB), image(10MB), voice(2MB)
     * @returns media_id，3天内有效
     */
    async uploadMedia(
        fileBuffer: Buffer,
        filename: string,
        type: 'file' | 'image' | 'voice' = 'file'
    ): Promise<string> {
        if (!this.webhookUrl) {
            throw new Error('WECOM_WEBHOOK_URL not configured')
        }

        logger.info(
            {
                filename,
                type,
                size: fileBuffer.length,
                sizeKB: Math.round(fileBuffer.length / 1024)
            },
            'WeCom: Uploading media file'
        )

        const key = this.extractKeyFromWebhook()
        const uploadUrl = `https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=${key}&type=${type}`

        const boundary = `----FormBoundary${Date.now()}`
        const parts: Buffer[] = []

        parts.push(Buffer.from(`--${boundary}\r\n`))
        parts.push(
            Buffer.from(`Content-Disposition: form-data; name="media"; filename="${filename}"\r\n`)
        )
        parts.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'))
        parts.push(fileBuffer)
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

        const body = Buffer.concat(parts)

        const response = await axios.post(uploadUrl, body, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            }
        })

        if (response.data?.errcode !== 0) {
            logger.error(
                { errcode: response.data?.errcode, errmsg: response.data?.errmsg },
                'WeCom: Media upload failed'
            )
            throw new Error(`WeCom upload error: ${response.data?.errmsg || 'Unknown error'}`)
        }

        logger.info(
            { filename, mediaId: response.data.media_id },
            'WeCom: Media uploaded successfully'
        )
        return response.data.media_id
    }

    /**
     * 从Webhook URL中提取key参数
     */
    private extractKeyFromWebhook(): string {
        const match = this.webhookUrl.match(/key=([^&]+)/)
        if (!match) {
            throw new Error('Invalid webhook URL: cannot extract key')
        }
        return match[1]
    }

    /**
     * 发送HTTP请求到企业微信Webhook
     */
    private async sendRequest(body: object): Promise<void> {
        if (!this.webhookUrl) {
            throw new Error('WECOM_WEBHOOK_URL not configured')
        }

        const msgtype = (body as { msgtype?: string }).msgtype
        logger.debug({ msgtype }, 'WeCom: Sending webhook request')

        const response = await axios.post(this.webhookUrl, body)

        if (response.data?.errcode !== 0) {
            logger.error(
                { msgtype, errcode: response.data?.errcode, errmsg: response.data?.errmsg },
                'WeCom: Webhook request failed'
            )
            throw new Error(`WeCom webhook error: ${response.data?.errmsg || 'Unknown error'}`)
        }

        logger.info({ msgtype }, 'WeCom: Message sent successfully')
    }
}

/**
 * Telegram推送器
 *
 * 通过Bot API发送消息到Telegram用户或群组
 * 支持文本、图片、文档等消息类型
 */
class TelegramPusher {
    private bot: TelegramBot
    private chatId: number

    constructor(
        token: string,
        chatId: string,
        proxy?: { type: 'http' | 'socks'; host: string; port: number }
    ) {
        const options: TelegramBot.ConstructorOptions = {}

        if (proxy) {
            const proxyUrl =
                proxy.type === 'socks'
                    ? `socks5://${proxy.host}:${proxy.port}`
                    : `http://${proxy.host}:${proxy.port}`
            options.request = { proxy: proxyUrl } as any
            logger.info({ proxyType: proxy.type, host: proxy.host }, 'Telegram: Using proxy')
        }

        this.bot = new TelegramBot(token, options)
        this.chatId = parseInt(chatId, 10)
        logger.debug({ chatId: this.chatId }, 'Telegram: Pusher initialized')
    }

    /**
     * 发送文本消息
     * 支持Markdown、MarkdownV2、HTML解析模式
     */
    async sendText(message: TelegramTextMessage): Promise<void> {
        logger.debug(
            { type: 'text', contentLength: message.content.length, parseMode: message.parseMode },
            'Telegram: Preparing text message'
        )
        const options: TelegramBot.SendMessageOptions = {}
        if (message.parseMode) {
            options.parse_mode = message.parseMode
        }
        await this.bot.sendMessage(this.chatId, message.content, options)
        logger.info({ type: 'text', parseMode: message.parseMode }, 'Telegram: Text message sent')
    }

    /**
     * 发送图片消息
     * 支持URL或Buffer
     */
    async sendImage(message: TelegramImageMessage): Promise<void> {
        const isUrl = typeof message.photo === 'string'
        logger.debug(
            { type: 'image', isUrl, caption: message.caption ? true : false },
            'Telegram: Preparing image message'
        )
        const options: TelegramBot.SendPhotoOptions = {}
        if (message.caption) {
            options.caption = message.caption
        }
        await this.bot.sendPhoto(this.chatId, message.photo, options)
        logger.info({ type: 'image', isUrl }, 'Telegram: Image sent')
    }

    /**
     * 发送文档消息
     * 支持URL或Buffer
     */
    async sendDocument(message: TelegramDocumentMessage): Promise<void> {
        const isUrl = typeof message.document === 'string'
        logger.debug(
            {
                type: 'document',
                isUrl,
                filename: message.filename,
                caption: message.caption ? true : false
            },
            'Telegram: Preparing document message'
        )
        const options: TelegramBot.SendDocumentOptions = {}
        if (message.caption) {
            options.caption = message.caption
        }

        const fileOptions: TelegramBot.FileOptions = {}
        if (message.filename) {
            fileOptions.filename = message.filename
        }

        await this.bot.sendDocument(this.chatId, message.document, options, fileOptions)
        logger.info(
            { type: 'document', filename: message.filename, isUrl },
            'Telegram: Document sent'
        )
    }
}

/**
 * 发送企业微信消息
 *
 * 处理各种消息类型，包括自动处理大图片（>2MB转为文件发送）
 */
async function sendWecomMessage(
    message: WecomMessage | { type: 'file_upload'; buffer: Buffer; filename: string }
): Promise<void> {
    logger.info({ type: message.type }, 'WeCom: Sending message')
    const pusher = new WecomPusher(WECOM_WEBHOOK_URL)

    switch (message.type) {
        case 'text':
            await pusher.sendText(message)
            break
        case 'markdown':
            await pusher.sendMarkdown(message)
            break
        case 'image':
            await pusher.sendImage(message)
            break
        case 'news':
            await pusher.sendNews(message)
            break
        case 'file':
            await pusher.sendFile(message)
            break
        case 'file_upload': {
            logger.info(
                {
                    filename: message.filename,
                    size: message.buffer.length,
                    sizeKB: Math.round(message.buffer.length / 1024)
                },
                'WeCom: Auto-uploading file'
            )
            const mediaId = await pusher.uploadMedia(message.buffer, message.filename, 'file')
            await pusher.sendFile({ type: 'file', mediaId })
            break
        }
        default: {
            const exhaustiveCheck: never = message
            throw new Error(
                `Unsupported WeCom message type: ${(exhaustiveCheck as { type: string }).type}`
            )
        }
    }
}

/**
 * 发送Telegram消息
 */
async function sendTelegramMessage(message: TelegramMessage): Promise<void> {
    logger.info({ type: message.type }, 'Telegram: Sending message')

    if (!TELEGRAM_BOT_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN not configured')
    }
    if (!TELEGRAM_USER_ID) {
        throw new Error('TELEGRAM_USER_ID not configured')
    }

    let proxy: { type: 'http' | 'socks'; host: string; port: number } | undefined
    if (TELEGRAM_PROXY_TYPE && TELEGRAM_PROXY_HOST && TELEGRAM_PROXY_PORT) {
        proxy = {
            type: TELEGRAM_PROXY_TYPE,
            host: TELEGRAM_PROXY_HOST,
            port: TELEGRAM_PROXY_PORT
        }
    }

    const pusher = new TelegramPusher(TELEGRAM_BOT_TOKEN, TELEGRAM_USER_ID, proxy)

    switch (message.type) {
        case 'text':
            await pusher.sendText(message)
            break
        case 'image':
            await pusher.sendImage(message)
            break
        case 'document':
            await pusher.sendDocument(message)
            break
        default: {
            const exhaustiveCheck: never = message
            throw new Error(
                `Unsupported Telegram message type: ${(exhaustiveCheck as { type: string }).type}`
            )
        }
    }
}

/**
 * 解析企业微信消息请求
 *
 * 处理逻辑:
 * - text: 纯文本消息
 * - markdown: Markdown格式消息
 * - image: URL转为图文消息，Base64转图片（>2MB自动转文件）
 * - news: 图文消息
 * - file: 支持mediaId或Base64上传
 */
function parseWecomMessage(
    body: PushRequest
): WecomMessage | { type: 'file_upload'; buffer: Buffer; filename: string } {
    const msgType = (body.msgtype || body.type || 'text') as WecomMessageType

    switch (msgType) {
        case 'text':
            return {
                type: 'text',
                content: body.content,
                mentionedList: body.mentionedList,
                mentionedMobileList: body.mentionedMobileList
            }

        case 'markdown':
            return {
                type: 'markdown',
                content: body.content
            }

        case 'image': {
            if (isUrl(body.content)) {
                return {
                    type: 'news',
                    articles: [
                        {
                            title: '图片',
                            url: body.content,
                            picurl: body.content
                        }
                    ]
                }
            }

            let buffer: Buffer
            if (isBase64(body.content)) {
                const parsed = parseBase64Data(body.content)
                buffer = parsed.buffer
            } else {
                throw new Error('WeCom image requires base64 encoded content or URL')
            }

            const WECOM_IMAGE_SIZE_LIMIT = 2 * 1024 * 1024
            if (buffer.length > WECOM_IMAGE_SIZE_LIMIT) {
                logger.info(
                    { size: buffer.length, limit: WECOM_IMAGE_SIZE_LIMIT },
                    'Image exceeds 2MB limit, will upload as file'
                )
                const filename = body.filename || `image_${Date.now()}.jpg`
                return {
                    type: 'file_upload',
                    buffer,
                    filename
                }
            }

            const base64 = buffer.toString('base64')
            const md5 = crypto.createHash('md5').update(buffer).digest('hex')
            return {
                type: 'image',
                base64,
                md5
            }
        }

        case 'news':
            if (!body.articles || body.articles.length === 0) {
                throw new Error('WeCom news message requires articles array')
            }
            return {
                type: 'news',
                articles: body.articles
            }

        case 'file': {
            if (body.mediaId) {
                return {
                    type: 'file',
                    mediaId: body.mediaId
                }
            }

            if (isBase64(body.content)) {
                const parsed = parseBase64Data(body.content)
                const filename = body.filename || `file_${Date.now()}`
                return {
                    type: 'file_upload',
                    buffer: parsed.buffer,
                    filename
                }
            }

            throw new Error('WeCom file message requires mediaId or base64 encoded content')
        }

        default:
            throw new Error(`Unsupported WeCom message type: ${msgType}`)
    }
}

/**
 * 转义Telegram MarkdownV2特殊字符
 *
 * MarkdownV2需要转义的字符: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
function escapeMarkdownV2(text: string): string {
    const specialChars = '_*[]()~`>#+-=|{}.!'
    let result = ''
    for (const char of text) {
        if (specialChars.includes(char)) {
            result += '\\' + char
        } else {
            result += char
        }
    }
    return result
}

/**
 * 解析Telegram消息请求
 *
 * 处理逻辑:
 * - text: 纯文本消息
 * - markdown: 自动转义特殊字符（MarkdownV2格式）
 * - image: 支持URL或Base64
 * - file/document: 支持URL或Base64
 */
function parseTelegramMessage(body: PushRequest): TelegramMessage {
    let msgType = (body.msgtype || body.type || 'text') as TelegramMessageType

    if (msgType === 'file') {
        msgType = 'document'
    }

    switch (msgType) {
        case 'text':
            return {
                type: 'text',
                content: body.content,
                parseMode: body.parseMode
            }

        case 'markdown': {
            let content = body.content
            let parseMode = body.parseMode

            if (!parseMode) {
                parseMode = 'MarkdownV2'
                content = escapeMarkdownV2(content)
            }

            return {
                type: 'text',
                content,
                parseMode
            }
        }

        case 'image': {
            let photo: string | Buffer
            if (isUrl(body.content)) {
                photo = body.content
            } else if (isBase64(body.content)) {
                const parsed = parseBase64Data(body.content)
                photo = parsed.buffer
            } else {
                throw new Error('Telegram image requires URL or base64 encoded content')
            }
            return {
                type: 'image',
                photo,
                caption: body.caption
            }
        }

        case 'document': {
            let document: string | Buffer
            if (isUrl(body.content)) {
                document = body.content
            } else if (isBase64(body.content)) {
                const parsed = parseBase64Data(body.content)
                document = parsed.buffer
            } else {
                throw new Error('Telegram document requires URL or base64 encoded content')
            }
            return {
                type: 'document',
                document,
                filename: body.filename,
                caption: body.caption
            }
        }

        default:
            throw new Error(`Unsupported Telegram message type: ${msgType}`)
    }
}

/**
 * 注册推送API路由
 *
 * 路由端点:
 * - POST /send - 发送消息到指定平台
 * - POST /send/all - 广播消息到所有平台
 * - GET /status - 获取平台状态
 * - POST /wecom/upload - 上传文件到企业微信
 */
export async function registerPushApiRoutes(fastify: FastifyInstance): Promise<void> {
    /**
     * POST /api/push/send
     *
     * 发送消息到指定平台
     *
     * 请求体:
     * {
     *   "platform": "wecom" | "telegram",
     *   "msgtype": "text" | "markdown" | "image" | "file",
     *   "content": "消息内容或Base64编码的文件",
     *   "filename": "文件名（可选）",
     *   "caption": "图片/文件说明（可选）"
     * }
     *
     * 响应:
     * {
     *   "success": true,
     *   "platform": "wecom",
     *   "type": "text"
     * }
     */
    fastify.post<{ Body: PushRequest }>('/send', async (request, reply) => {
        const { platform } = request.body
        const msgType = request.body.msgtype || request.body.type || 'text'

        logger.info(
            { ip: request.ip, platform, msgType, contentLength: request.body.content?.length },
            'Push API: Received send request'
        )

        if (!['wecom', 'telegram'].includes(platform)) {
            logger.warn({ ip: request.ip, platform }, 'Push API: Invalid platform')
            return reply
                .code(400)
                .send({ success: false, error: 'Invalid platform. Use "wecom" or "telegram"' })
        }

        try {
            if (platform === 'wecom') {
                const message = parseWecomMessage(request.body)
                logger.debug({ platform, type: message.type }, 'Push API: Parsed WeCom message')
                await sendWecomMessage(message)
                logger.info({ platform, type: message.type }, 'Push API: Message sent successfully')
                return { success: true, platform, type: message.type }
            } else {
                const message = parseTelegramMessage(request.body)
                logger.debug({ platform, type: message.type }, 'Push API: Parsed Telegram message')
                await sendTelegramMessage(message)
                logger.info({ platform, type: message.type }, 'Push API: Message sent successfully')
                return { success: true, platform, type: message.type }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            logger.error(
                { ip: request.ip, platform, msgType, error: errorMessage },
                'Push API: Send failed'
            )
            return reply.code(500).send({ success: false, error: errorMessage })
        }
    })

    /**
     * POST /api/push/send/all
     *
     * 广播消息到所有已配置的平台
     *
     * 响应:
     * {
     *   "success": true,
     *   "results": [
     *     { "platform": "wecom", "success": true },
     *     { "platform": "telegram", "success": true }
     *   ]
     * }
     */
    fastify.post<{ Body: PushRequest }>('/send/all', async (request, reply) => {
        const msgType = request.body.msgtype || request.body.type || 'text'

        logger.info(
            { ip: request.ip, msgType, contentLength: request.body.content?.length },
            'Push API: Received broadcast request'
        )

        const results: { platform: string; success: boolean; error?: string }[] = []

        if (WECOM_WEBHOOK_URL) {
            logger.debug('Push API: Attempting to send to WeCom')
            try {
                const message = parseWecomMessage(request.body)
                await sendWecomMessage(message)
                results.push({ platform: 'wecom', success: true })
                logger.info('Push API: Broadcast to WeCom succeeded')
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error'
                logger.error(
                    { platform: 'wecom', error: errorMessage },
                    'Push API: Broadcast to WeCom failed'
                )
                results.push({ platform: 'wecom', success: false, error: errorMessage })
            }
        } else {
            logger.debug('Push API: WeCom not configured, skipping')
        }

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_USER_ID) {
            logger.debug('Push API: Attempting to send to Telegram')
            try {
                const message = parseTelegramMessage(request.body)
                await sendTelegramMessage(message)
                results.push({ platform: 'telegram', success: true })
                logger.info('Push API: Broadcast to Telegram succeeded')
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error'
                logger.error(
                    { platform: 'telegram', error: errorMessage },
                    'Push API: Broadcast to Telegram failed'
                )
                results.push({ platform: 'telegram', success: false, error: errorMessage })
            }
        } else {
            logger.debug('Push API: Telegram not configured, skipping')
        }

        const allSuccess = results.length > 0 && results.every((r) => r.success)
        logger.info(
            {
                totalPlatforms: results.length,
                successCount: results.filter((r) => r.success).length,
                allSuccess
            },
            'Push API: Broadcast completed'
        )
        return { success: allSuccess, results }
    })

    /**
     * GET /api/push/status
     *
     * 获取各平台的可用状态
     *
     * 响应:
     * {
     *   "success": true,
     *   "platforms": {
     *     "wecom": { "available": true, "type": "webhook" },
     *     "telegram": { "available": true, "type": "bot" }
     *   }
     * }
     */
    fastify.get('/status', async () => {
        return {
            success: true,
            platforms: {
                wecom: { available: !!WECOM_WEBHOOK_URL, type: 'webhook' },
                telegram: { available: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_USER_ID), type: 'bot' }
            }
        }
    })

    /**
     * POST /api/push/wecom/upload
     *
     * 上传文件到企业微信获取media_id
     * media_id 3天内有效
     *
     * 请求体:
     * {
     *   "filename": "document.pdf",
     *   "content": "Base64编码的文件内容",
     *   "type": "file" | "image" | "voice"
     * }
     *
     * 响应:
     * {
     *   "success": true,
     *   "mediaId": "xxx"
     * }
     */
    fastify.post<{
        Body: { filename: string; content: string; type?: 'file' | 'image' | 'voice' }
    }>('/wecom/upload', async (request, reply) => {
        const { filename, content, type = 'file' } = request.body

        logger.info(
            { ip: request.ip, filename, type, contentLength: content?.length },
            'Push API: Received WeCom upload request'
        )

        if (!WECOM_WEBHOOK_URL) {
            logger.warn('Push API: WeCom not configured, upload rejected')
            return reply
                .code(500)
                .send({ success: false, error: 'WECOM_WEBHOOK_URL not configured' })
        }

        try {
            let buffer: Buffer
            if (isBase64(content)) {
                const parsed = parseBase64Data(content)
                buffer = parsed.buffer
                logger.debug(
                    {
                        filename,
                        mimeType: parsed.mimeType,
                        size: buffer.length,
                        sizeKB: Math.round(buffer.length / 1024)
                    },
                    'Push API: Parsed base64 content'
                )
            } else {
                logger.warn({ filename }, 'Push API: Content is not valid base64')
                throw new Error('Content must be base64 encoded')
            }

            const pusher = new WecomPusher(WECOM_WEBHOOK_URL)
            const mediaId = await pusher.uploadMedia(buffer, filename, type)

            logger.info({ filename, mediaId, type }, 'Push API: WeCom upload succeeded')
            return { success: true, mediaId }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            logger.error({ filename, type, error: errorMessage }, 'Push API: WeCom upload failed')
            return reply.code(500).send({ success: false, error: errorMessage })
        }
    })
}
