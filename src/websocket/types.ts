/**
 * WebSocket 模块类型定义
 *
 * 定义 WebSocket 消息转发服务所需的类型和接口
 */

import type { StandardMessage } from '../core/types.js'

/**
 * WebSocket 消息类型枚举
 */
export type WsMessageType = 'message' | 'connected' | 'ping' | 'pong'

/**
 * WebSocket 发送的消息格式
 */
export interface WsMessage {
    type: WsMessageType
    timestamp: string
    data?: StandardMessage
}

/**
 * WebSocket 服务配置
 */
export interface WsServiceConfig {
    /** 最近消息缓存时间（毫秒），默认 5 分钟 */
    cacheDuration?: number
    /** 是否启用，默认 true */
    enabled?: boolean
    /** 心跳间隔（毫秒），默认 30 秒 */
    heartbeatInterval?: number
    /** 心跳超时时间（毫秒），默认 60 秒 */
    heartbeatTimeout?: number
}

/**
 * WebSocket 客户端连接参数
 */
export interface WsClientParams {
    user?: string
    os?: string
    arch?: string
    desc?: string
}

/**
 * WebSocket 客户端信息
 */
export interface WsClient {
    id: string
    connectedAt: Date
    lastPingAt: number
    user?: string
    os?: string
    arch?: string
    desc?: string
}
