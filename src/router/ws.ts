/**
 * WebSocket 路由处理模块
 *
 * 提供 WebSocket 升级和连接处理
 */

import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import { wsMessageService } from '../websocket/service.js'
import type { WsClientParams } from '../websocket/types.js'
import { logger } from '../logger.js'

/**
 * 解析 URL 查询参数
 */
function parseQueryParams(url: string): WsClientParams {
    try {
        const myURL = new URL(url, 'http://localhost')
        const { user, os, arch, desc } = Object.fromEntries(myURL.searchParams)
        return { user, os, arch, desc } as WsClientParams
    } catch {
        return {}
    }
}

/**
 * 注册 WebSocket 路由
 *
 * 在 /ws 路径提供 WebSocket 连接
 */
export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
    const wss = new WebSocketServer({ noServer: true })

    wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        const clientIp = request.socket.remoteAddress || 'unknown'
        const params = parseQueryParams(request.url || '')
        logger.info({ clientIp, params }, 'New WebSocket connection')

        wsMessageService.addClient(ws, params)

        ws.on('message', (data: Buffer) => {
            wsMessageService.handleClientMessage(ws, data.toString())
        })

        ws.on('close', () => {
            wsMessageService.removeClient(ws)
        })

        ws.on('error', (error: Error) => {
            logger.error({ error: error.message }, 'WebSocket error')
            wsMessageService.removeClient(ws)
        })
    })

    fastify.server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const pathname = request.url?.split('?')[0]

        if (pathname === '/ws') {
            wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
                wss.emit('connection', ws, request)
            })
        }
    })

    fastify.get('/api/ws/status', async () => {
        return {
            success: true,
            ...wsMessageService.getStatus()
        }
    })

    logger.info('WebSocket routes registered at /ws')
}
