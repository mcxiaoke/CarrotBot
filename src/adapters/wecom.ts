/**
 * 企业微信适配器模块
 *
 * 本模块实现了企业微信智能机器人的适配器，通过 WebSocket 长连接方式与企业微信服务器通信。
 * 支持消息接收、多种类型消息发送、媒体文件上传下载等功能。
 *
 * 主要功能：
 * - WebSocket 长连接管理和认证
 * - 消息解析和转换
 * - 文本、Markdown、图片、语音、视频、文件等消息发送
 * - 模板卡片和流式消息发送（用于 AI 对话）
 * - 媒体文件上传和下载
 * - 主动消息推送
 */

import AiBot, { WSClient } from '@wecom/aibot-node-sdk'
import type { WsFrame, TemplateCard } from '@wecom/aibot-node-sdk'
import { generateReqId } from '@wecom/aibot-node-sdk'
import type { IAdapter, StandardMessage, MessageType } from '../core/types.js'
import { saveIncomingMessage, saveOutgoingMessage } from '../storage/message-store.js'
import { logger } from '../logger.js'

/**
 * 企业微信适配器配置接口
 */
export interface WeComConfig {
    /** 机器人 ID，从企业微信管理后台获取 */
    botId: string
    /** 机器人密钥，从企业微信管理后台获取 */
    botSecret: string
}

/**
 * 企业微信事件类型
 */
export type WeComEventType =
    | 'enter_chat'
    | 'template_card_event'
    | 'feedback_event'
    | 'disconnected_event'

/**
 * 企业微信事件接口
 */
export interface WeComEvent {
    /** 事件类型 */
    type: WeComEventType
    /** 原始 WebSocket 帧数据 */
    frame: WsFrame
}

/**
 * 企业微信适配器类
 *
 * 实现了 IAdapter 接口，提供企业微信平台的消息收发能力。
 * 使用 @wecom/aibot-node-sdk 进行 WebSocket 通信。
 *
 * @example
 * ```typescript
 * const adapter = new WeComAdapter({
 *   botId: 'your-bot-id',
 *   botSecret: 'your-bot-secret'
 * });
 *
 * adapter.setMessageHandler((msg) => {
 *   // 处理收到的消息
 * });
 *
 * adapter.connect();
 * ```
 */
export class WeComAdapter implements IAdapter {
    /** 平台标识 */
    readonly platform = 'wecom'

    /** WebSocket 客户端实例 */
    private client: WSClient

    /** 消息处理回调函数 */
    private onMessage: ((msg: StandardMessage) => void) | null = null

    /** 事件处理回调函数 */
    private onEvent: ((event: WeComEvent) => void) | null = null

    /**
     * 创建企业微信适配器实例
     * @param config - 适配器配置
     */
    constructor(config: WeComConfig) {
        this.client = new AiBot.WSClient({
            botId: config.botId,
            secret: config.botSecret
        })
    }

    /**
     * 解析企业微信原始消息为标准格式
     *
     * 将企业微信的 WebSocket 帧数据转换为系统内部统一的消息格式。
     * 支持文本、图片、语音、视频、文件、图文混排和事件等多种消息类型。
     *
     * @param raw - 原始 WebSocket 帧数据
     * @returns 标准化的消息对象
     */
    parseMessage(raw: unknown): StandardMessage {
        const frame = raw as WsFrame
        const body = frame.body as Record<string, unknown>
        const msgtype = body.msgtype as string

        let content = ''
        let msgType: MessageType = 'text'
        let mediaUrl: string | undefined
        let mediaKey: string | undefined
        let aesKey: string | undefined

        // 根据消息类型解析不同的消息内容
        switch (msgtype) {
            case 'text':
                // 文本消息
                content = (body.text as Record<string, string>)?.content || ''
                msgType = 'text'
                break
            case 'image':
                // 图片消息
                content = '[图片]'
                msgType = 'image'
                mediaUrl = (body.image as Record<string, string>)?.url
                mediaKey = (body.image as Record<string, string>)?.key
                aesKey = (body.image as Record<string, string>)?.aeskey
                break
            case 'voice':
                // 语音消息
                content = '[语音]'
                msgType = 'voice'
                mediaUrl = (body.voice as Record<string, string>)?.url
                mediaKey = (body.voice as Record<string, string>)?.key
                aesKey = (body.voice as Record<string, string>)?.aeskey
                break
            case 'video':
                // 视频消息
                content = '[视频]'
                msgType = 'video'
                mediaUrl = (body.video as Record<string, string>)?.url
                mediaKey = (body.video as Record<string, string>)?.key
                aesKey = (body.video as Record<string, string>)?.aeskey
                break
            case 'file':
                // 文件消息
                content = `[文件] ${(body.file as Record<string, string>)?.filename || ''}`
                msgType = 'file'
                mediaUrl = (body.file as Record<string, string>)?.url
                mediaKey = (body.file as Record<string, string>)?.key
                aesKey = (body.file as Record<string, string>)?.aeskey
                break
            case 'mixed':
                // 图文混排消息
                content = '[图文混排]'
                msgType = 'mixed'
                break
            case 'event':
                // 事件消息
                content = '[事件]'
                msgType = 'event'
                break
            default:
                // 未知消息类型
                content = `[未知消息类型: ${msgtype}]`
                msgType = 'text'
        }

        // 获取发送者标识（群聊使用 chatid，私聊使用 userid）
        const chatid = body.chatid as string
        const userid = (body.from as Record<string, string>)?.userid
        const from = chatid || userid || ''

        return {
            platform: this.platform,
            from,
            content: content.trim(),
            msgType,
            raw,
            mediaUrl,
            mediaKey,
            aesKey
        }
    }

    /**
     * 发送消息（默认使用 Markdown 格式）
     * @param msg - 原始消息对象
     * @param content - 消息内容
     */
    async sendMessage(msg: StandardMessage, content: string): Promise<void> {
        return this.sendMarkdown(msg, content)
    }

    /**
     * 发送纯文本消息
     * @param msg - 原始消息对象
     * @param content - 文本内容
     */
    async sendText(msg: StandardMessage, content: string): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.reply(frame, {
                msgtype: 'text',
                text: { content }
            })
            await saveOutgoingMessage(msg, 'text', content)
            logger.debug({ to: msg.from, content }, 'Text message sent')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to send text message')
            throw err
        }
    }

    /**
     * 发送 Markdown 格式消息
     * @param msg - 原始消息对象
     * @param content - Markdown 格式内容
     */
    async sendMarkdown(msg: StandardMessage, content: string): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.reply(frame, {
                msgtype: 'markdown',
                markdown: { content }
            })
            await saveOutgoingMessage(msg, 'markdown', content)
            logger.debug({ to: msg.from, content }, 'Markdown message sent')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to send markdown message')
            throw err
        }
    }

    /**
     * 发送图片消息
     * @param msg - 原始消息对象
     * @param mediaId - 媒体文件 ID（需先上传获取）
     */
    async sendImage(msg: StandardMessage, mediaId: string): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.replyMedia(frame, 'image', mediaId)
            await saveOutgoingMessage(msg, 'image', null, mediaId)
            logger.debug({ to: msg.from, mediaId }, 'Image message sent')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to send image message')
            throw err
        }
    }

    /**
     * 发送语音消息
     * @param msg - 原始消息对象
     * @param mediaId - 媒体文件 ID
     */
    async sendVoice(msg: StandardMessage, mediaId: string): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.replyMedia(frame, 'voice', mediaId)
            await saveOutgoingMessage(msg, 'voice', null, mediaId)
            logger.debug({ to: msg.from, mediaId }, 'Voice message sent')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to send voice message')
            throw err
        }
    }

    /**
     * 发送视频消息
     * @param msg - 原始消息对象
     * @param mediaId - 媒体文件 ID
     * @param title - 视频标题（可选）
     * @param description - 视频描述（可选）
     */
    async sendVideo(
        msg: StandardMessage,
        mediaId: string,
        title?: string,
        description?: string
    ): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.replyMedia(frame, 'video', mediaId, { title, description })
            await saveOutgoingMessage(msg, 'video', null, mediaId)
            logger.debug({ to: msg.from, mediaId }, 'Video message sent')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to send video message')
            throw err
        }
    }

    /**
     * 发送文件消息
     * @param msg - 原始消息对象
     * @param mediaId - 媒体文件 ID
     */
    async sendFile(msg: StandardMessage, mediaId: string): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.replyMedia(frame, 'file', mediaId)
            await saveOutgoingMessage(msg, 'file', null, mediaId)
            logger.debug({ to: msg.from, mediaId }, 'File message sent')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to send file message')
            throw err
        }
    }

    /**
     * 发送模板卡片消息
     *
     * 模板卡片是一种丰富的消息展示形式，支持多种布局和交互按钮。
     *
     * @param msg - 原始消息对象
     * @param card - 模板卡片数据
     */
    async sendTemplateCard(msg: StandardMessage, card: TemplateCard): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.replyTemplateCard(frame, card)
            await saveOutgoingMessage(msg, 'template_card', JSON.stringify(card))
            logger.debug({ to: msg.from }, 'Template card sent')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to send template card')
            throw err
        }
    }

    /**
     * 发送流式消息
     *
     * 流式消息用于 AI 对话场景，支持逐步输出内容。
     * 通过 streamId 标识同一个流，finish 参数标识是否为最后一条消息。
     *
     * @param msg - 原始消息对象
     * @param streamId - 流标识符
     * @param content - 消息内容
     * @param finish - 是否为最后一条消息
     */
    async sendStream(
        msg: StandardMessage,
        streamId: string,
        content: string,
        finish: boolean
    ): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.replyStream(frame, streamId, content, finish)
            if (finish) {
                await saveOutgoingMessage(msg, 'stream', content)
            }
            logger.debug({ to: msg.from, streamId, finish }, 'Stream message sent')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to send stream message')
            throw err
        }
    }

    /**
     * 发送带模板卡片的流式消息
     *
     * 结合流式消息和模板卡片，在流结束后显示交互卡片。
     *
     * @param msg - 原始消息对象
     * @param streamId - 流标识符
     * @param content - 消息内容
     * @param finish - 是否为最后一条消息
     * @param card - 模板卡片数据
     */
    async sendStreamWithCard(
        msg: StandardMessage,
        streamId: string,
        content: string,
        finish: boolean,
        card: TemplateCard
    ): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.replyStreamWithCard(frame, streamId, content, finish, {
                templateCard: card
            })
            logger.debug({ to: msg.from, streamId, finish }, 'Stream with card sent')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to send stream with card')
            throw err
        }
    }

    /**
     * 更新已发送的模板卡片
     *
     * 用于更新已发送卡片的显示内容或状态。
     *
     * @param msg - 原始消息对象
     * @param card - 新的模板卡片数据
     * @param userids - 指定更新的用户 ID 列表（可选）
     */
    async updateTemplateCard(
        msg: StandardMessage,
        card: TemplateCard,
        userids?: string[]
    ): Promise<void> {
        try {
            const frame = msg.raw as WsFrame
            await this.client.updateTemplateCard(frame, card, userids)
            logger.debug({ to: msg.from }, 'Template card updated')
        } catch (err) {
            logger.error({ err, to: msg.from }, 'Failed to update template card')
            throw err
        }
    }

    /**
     * 生成流标识符
     * @returns 唯一的流标识符
     */
    generateStreamId(): string {
        return generateReqId('stream')
    }

    /**
     * 上传媒体文件
     *
     * 上传图片、语音、视频或文件到企业微信服务器，获取 mediaId 用于发送。
     *
     * @param fileBuffer - 文件二进制数据
     * @param type - 媒体类型
     * @param filename - 文件名
     * @returns 媒体文件 ID
     */
    async uploadMedia(
        fileBuffer: Buffer,
        type: 'image' | 'voice' | 'video' | 'file',
        filename: string
    ): Promise<string> {
        try {
            const result = await this.client.uploadMedia(fileBuffer, { type, filename })
            logger.debug({ type, mediaId: result.media_id }, 'Media uploaded')
            return result.media_id
        } catch (err) {
            logger.error({ err, type }, 'Failed to upload media')
            throw err
        }
    }

    /**
     * 下载媒体文件
     *
     * 从企业微信服务器下载媒体文件，使用 AES 密钥解密。
     *
     * @param url - 文件下载 URL
     * @param aesKey - AES 解密密钥
     * @returns 文件二进制数据和文件名
     */
    async downloadFile(
        url: string,
        aesKey: string
    ): Promise<{ buffer: Buffer; filename?: string }> {
        try {
            const result = await this.client.downloadFile(url, aesKey)
            logger.debug({ url }, 'File downloaded')
            return result
        } catch (err) {
            logger.error({ err, url }, 'Failed to download file')
            throw err
        }
    }

    /**
     * 主动推送消息
     *
     * 向指定会话主动发送消息，无需用户先发起对话。
     *
     * @param chatid - 会话 ID
     * @param content - 消息内容（Markdown 格式）
     */
    async pushMessage(chatid: string, content: string): Promise<void> {
        try {
            await this.client.sendMessage(chatid, {
                msgtype: 'markdown',
                markdown: { content }
            })
            logger.debug({ chatid, content }, 'Push message sent')
        } catch (err) {
            logger.error({ err, chatid }, 'Failed to push message')
            throw err
        }
    }

    /**
     * 主动推送媒体消息
     *
     * 向指定会话主动发送媒体文件。
     *
     * @param chatid - 会话 ID
     * @param type - 媒体类型
     * @param mediaId - 媒体文件 ID
     */
    async pushMediaMessage(
        chatid: string,
        type: 'image' | 'voice' | 'video' | 'file',
        mediaId: string
    ): Promise<void> {
        try {
            await this.client.sendMediaMessage(chatid, type, mediaId)
            logger.debug({ chatid, type, mediaId }, 'Push media message sent')
        } catch (err) {
            logger.error({ err, chatid }, 'Failed to push media message')
            throw err
        }
    }

    /**
     * 设置消息处理回调
     * @param handler - 消息处理函数
     */
    setMessageHandler(handler: (msg: StandardMessage) => void): void {
        this.onMessage = handler
    }

    /**
     * 设置事件处理回调
     * @param handler - 事件处理函数
     */
    setEventHandler(handler: (event: WeComEvent) => void): void {
        this.onEvent = handler
    }

    /**
     * 连接到企业微信服务器
     *
     * 建立 WebSocket 连接并注册各类事件监听器。
     */
    connect(): void {
        this.client.connect()

        // 认证成功事件
        this.client.on('authenticated', () => {
            logger.info('WeCom WebSocket authenticated')
        })

        // 收到消息事件
        this.client.on('message', (frame: WsFrame) => {
            const body = frame.body as Record<string, unknown>
            const msgtype = body.msgtype as string
            logger.debug({ msgtype, msgid: body.msgid }, 'Received message')
            this.handleMessage(frame, msgtype)
        })

        // 收到事件事件
        this.client.on('event', (frame: WsFrame) => {
            const body = frame.body as Record<string, unknown>
            const eventType = (body.event as Record<string, string>)?.eventtype
            logger.debug({ eventType, frame }, 'Received event')

            // 处理进入会话事件
            if (eventType === 'enter_chat') {
                this.handleEnterChat(frame)
            }
        })

        // 断开连接事件
        this.client.on('disconnected', () => {
            logger.warn('WeCom WebSocket disconnected')
        })

        // 错误事件
        this.client.on('error', (err: Error) => {
            logger.error({ err }, 'WeCom WebSocket error')
        })
    }

    /**
     * 处理用户进入会话事件
     * @param frame - WebSocket 帧数据
     */
    private async handleEnterChat(frame: WsFrame): Promise<void> {
        logger.info({ frame }, 'User entered chat')
        if (this.onEvent) {
            this.onEvent({ type: 'enter_chat', frame })
        }
        try {
            // 发送欢迎消息
            await this.client.replyWelcome(frame, {
                msgtype: 'text',
                text: { content: '你好！我是 CarrotBot，发送 /help 查看可用命令。' }
            })
        } catch (err) {
            logger.error({ err }, 'Failed to send welcome message')
        }
    }

    /**
     * 处理收到的消息
     * @param frame - WebSocket 帧数据
     * @param msgtype - 消息类型
     */
    private async handleMessage(frame: WsFrame, msgtype: string): Promise<void> {
        const msg = this.parseMessage(frame)

        // 保存收到的消息到数据库
        try {
            await saveIncomingMessage(msg, (url, aesKey) => this.downloadFile(url, aesKey))
            logger.info(
                { msgtype, msgid: (frame.body as Record<string, unknown>)?.msgid, from: msg.from },
                'Message saved'
            )
        } catch (err) {
            logger.error(
                { err, msgtype, msgid: (frame.body as Record<string, unknown>)?.msgid },
                'Failed to save incoming message'
            )
        }

        // 调用消息处理回调
        if (this.onMessage) {
            this.onMessage(msg)
        }
    }

    /**
     * 断开与企业微信服务器的连接
     */
    disconnect(): void {
        this.client.disconnect()
        logger.info('WeCom WebSocket disconnected')
    }
}
