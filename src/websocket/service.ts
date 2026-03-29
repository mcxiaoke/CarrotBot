/**
 * WebSocket 消息转发服务
 *
 * 本模块提供 WebSocket 消息转发功能：
 * - 管理客户端连接
 * - 缓存最近消息
 * - 实时转发消息给所有客户端
 * - 新客户端连接时发送最近消息
 * - 心跳检测和超时断开
 */

import type { WebSocket } from 'ws'
import type { StandardMessage } from '../core/types.js'
import type { WsMessage, WsServiceConfig, WsClient, WsClientParams } from './types.js'
import { logger } from '../logger.js'

interface WsConfig {
    cacheDuration: number
    enabled: boolean
    heartbeatInterval: number
    heartbeatTimeout: number
}

/**
 * WebSocket 消息转发服务类
 *
 * 单例模式，管理所有 WebSocket 客户端连接和消息转发
 */
class WsMessageService {
    private clients: Map<WebSocket, WsClient> = new Map()
    private recentMessages: StandardMessage[] = []
    private config: WsConfig
    private cleanupInterval: ReturnType<typeof setInterval> | null = null
    private heartbeatCheckInterval: ReturnType<typeof setInterval> | null = null

    constructor() {
        this.config = {
            cacheDuration: 2 * 60 * 1000,
            enabled: true,
            heartbeatInterval: 30 * 1000,
            heartbeatTimeout: 90 * 1000
        }
    }

    /**
     * 初始化服务
     */
    init(config?: WsServiceConfig): void {
        if (config?.cacheDuration !== undefined) {
            this.config.cacheDuration = config.cacheDuration
        }
        if (config?.enabled !== undefined) {
            this.config.enabled = config.enabled
        }
        if (config?.heartbeatInterval !== undefined) {
            this.config.heartbeatInterval = config.heartbeatInterval
        }
        if (config?.heartbeatTimeout !== undefined) {
            this.config.heartbeatTimeout = config.heartbeatTimeout
        }

        this.startCleanupInterval()
        this.startHeartbeatCheck()
        logger.info(
            {
                cacheDuration: this.config.cacheDuration,
                enabled: this.config.enabled,
                heartbeatInterval: this.config.heartbeatInterval,
                heartbeatTimeout: this.config.heartbeatTimeout
            },
            'WebSocket message service initialized'
        )
    }

    /**
     * 添加客户端连接
     */
    addClient(ws: WebSocket, params?: WsClientParams): void {
        const clientId = this.generateClientId(params)
        const now = Date.now()
        const client: WsClient = {
            id: clientId,
            connectedAt: new Date(),
            lastPingAt: now,
            user: params?.user,
            os: params?.os,
            arch: params?.arch,
            desc: params?.desc
        }
        this.clients.set(ws, client)
        logger.info(
            {
                clientId,
                clientCount: this.clients.size,
                user: params?.user,
                os: params?.os,
                arch: params?.arch
            },
            'WebSocket client connected'
        )

        this.sendConnected(ws, client)

        const recentMsg = this.getRecentMessage()
        if (recentMsg) {
            this.sendMessage(ws, recentMsg)
            logger.debug({ clientId }, 'Sent recent message to new client')
        }
    }

    /**
     * 移除客户端连接
     */
    removeClient(ws: WebSocket): void {
        const client = this.clients.get(ws)
        if (client) {
            this.clients.delete(ws)
            logger.info(
                { clientId: client.id, clientCount: this.clients.size },
                'WebSocket client disconnected'
            )
        }
    }

    /**
     * 处理客户端消息
     */
    handleClientMessage(ws: WebSocket, data: string): void {
        const client = this.clients.get(ws)
        if (!client) return

        try {
            const msg = JSON.parse(data) as { type: string }
            if (msg.type === 'ping') {
                client.lastPingAt = Date.now()
                this.sendPong(ws)
            }
        } catch {
            logger.warn({ data }, 'Invalid WebSocket message received')
        }
    }

    /**
     * 广播消息给所有客户端
     *
     * 当收到企业微信或 Telegram 消息时调用此方法
     */
    broadcast(message: StandardMessage): void {
        if (!this.config.enabled) {
            return
        }

        this.cacheMessage(message)

        if (this.clients.size === 0) {
            logger.debug('No WebSocket clients connected, skipping broadcast')
            return
        }

        const wsMessage: WsMessage = {
            type: 'message',
            timestamp: new Date().toISOString(),
            data: message
        }
        const payload = JSON.stringify(wsMessage)

        let sentCount = 0
        for (const [ws] of this.clients) {
            if (ws.readyState === 1) {
                ws.send(payload)
                sentCount++
            }
        }
        logger.debug(
            { platform: message.platform, sentCount, clientCount: this.clients.size },
            'Broadcast message to WebSocket clients'
        )
    }

    /**
     * 获取客户端数量
     */
    getClientCount(): number {
        return this.clients.size
    }

    /**
     * 获取所有客户端信息
     */
    getClients(): WsClient[] {
        return Array.from(this.clients.values())
    }

    /**
     * 获取服务状态
     */
    getStatus(): {
        enabled: boolean
        clientCount: number
        cachedMessages: number
        heartbeatInterval: number
        heartbeatTimeout: number
        clients: WsClient[]
    } {
        return {
            enabled: this.config.enabled,
            clientCount: this.clients.size,
            cachedMessages: this.recentMessages.length,
            heartbeatInterval: this.config.heartbeatInterval,
            heartbeatTimeout: this.config.heartbeatTimeout,
            clients: this.getClients()
        }
    }

    /**
     * 关闭服务
     */
    close(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
            this.cleanupInterval = null
        }
        if (this.heartbeatCheckInterval) {
            clearInterval(this.heartbeatCheckInterval)
            this.heartbeatCheckInterval = null
        }
        for (const [ws] of this.clients) {
            ws.close(1001, 'Server shutting down')
        }
        this.clients.clear()
        this.recentMessages = []
        logger.info('WebSocket message service closed')
    }

    /**
     * 生成客户端 ID
     *
     * 如果提供了 user、os、arch 参数，则使用它们生成 ID
     * 否则使用时间戳和随机字符串生成
     */
    private generateClientId(params?: WsClientParams): string {
        if (params?.user && params?.os && params?.arch) {
            return `${params.user}@${params.os}-${params.arch}`
        }
        return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    }

    private cacheMessage(message: StandardMessage): void {
        this.recentMessages.push(message)
        this.cleanupOldMessages()
    }

    private getRecentMessage(): StandardMessage | null {
        this.cleanupOldMessages()
        if (this.recentMessages.length === 0) {
            return null
        }
        return this.recentMessages[this.recentMessages.length - 1]
    }

    private cleanupOldMessages(): void {
        const now = Date.now()
        const cutoff = now - this.config.cacheDuration
        this.recentMessages = this.recentMessages.filter((msg) => {
            const raw = msg.raw as { timestamp?: number } | undefined
            const timestamp = raw?.timestamp
            if (timestamp && typeof timestamp === 'number') {
                return timestamp > cutoff
            }
            return true
        })
    }

    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldMessages()
        }, 60 * 1000)
    }

    private startHeartbeatCheck(): void {
        this.heartbeatCheckInterval = setInterval(() => {
            const now = Date.now()
            const timeout = this.config.heartbeatTimeout
            const toRemove: WebSocket[] = []

            for (const [ws, client] of this.clients) {
                if (now - client.lastPingAt > timeout) {
                    logger.warn(
                        { clientId: client.id, lastPingAt: client.lastPingAt },
                        'WebSocket client heartbeat timeout, closing'
                    )
                    ws.close(1001, 'Heartbeat timeout')
                    toRemove.push(ws)
                }
            }

            for (const ws of toRemove) {
                this.clients.delete(ws)
            }
        }, this.config.heartbeatInterval)
    }

    private sendMessage(ws: WebSocket, message: StandardMessage): void {
        if (ws.readyState !== 1) return
        const wsMessage: WsMessage = {
            type: 'message',
            timestamp: new Date().toISOString(),
            data: message
        }
        ws.send(JSON.stringify(wsMessage))
    }

    private sendConnected(ws: WebSocket, client: WsClient): void {
        if (ws.readyState !== 1) return
        const wsMessage: WsMessage = {
            type: 'connected',
            timestamp: new Date().toISOString()
        }
        ws.send(
            JSON.stringify({
                ...wsMessage,
                clientId: client.id,
                heartbeatInterval: this.config.heartbeatInterval,
                heartbeatTimeout: this.config.heartbeatTimeout
            })
        )
    }

    private sendPong(ws: WebSocket): void {
        if (ws.readyState !== 1) return
        const wsMessage: WsMessage = {
            type: 'pong',
            timestamp: new Date().toISOString()
        }
        ws.send(JSON.stringify(wsMessage))
    }
}

export const wsMessageService = new WsMessageService()
