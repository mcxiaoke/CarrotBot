/**
 * HTTP 服务器模块
 *
 * 本模块创建并配置 Fastify HTTP 服务器，提供 RESTful API 接口。
 * 包括健康检查、LAN 设备管理、消息管理、缓存管理和推送服务等接口。
 */

import Fastify, { FastifyInstance } from 'fastify'
import { logger } from './logger.js'
import { authHook } from './auth.js'
import { getLanService } from './lan/service.js'
import {
    queryMessages,
    getMessageById,
    countMessages,
    getStats,
    deleteMessagesBefore,
    type MessageQuery
} from './storage/database.js'
import {
    getCachedFiles,
    deleteCachedFile,
    clearCacheBefore,
    getCacheStats
} from './storage/cache.js'
import { pushService, type PushJob } from './services/push.js'
import { registerPushApiRoutes } from './router/push_api.js'
import { registerAdminRoutes } from './router/admin.js'

/**
 * 创建 HTTP 服务器
 *
 * 配置所有 API 路由并返回 Fastify 实例。
 *
 * @returns Fastify 实例
 */
export async function createServer(): Promise<FastifyInstance> {
    const fastify = Fastify({
        logger: false
    })

    fastify.addHook('onRequest', authHook)

    /**
     * 健康检查接口
     * GET /health
     */
    fastify.get('/health', async () => {
        return { status: 'ok', uptime: process.uptime() }
    })

    /**
     * 服务信息接口
     * GET /
     */
    fastify.get('/', async () => {
        return { name: 'CarrotBot', version: '1.0.0' }
    })

    /**
     * 管理页面路由
     */
    fastify.register(registerAdminRoutes)

    /**
     * LAN 设备管理接口
     * 前缀: /lan
     */
    fastify.register(
        async (instance) => {
            /**
             * 获取在线设备列表
             * GET /lan/devices
             */
            instance.get('/devices', async () => {
                const lanService = getLanService()
                if (!lanService) {
                    return { success: false, error: 'LAN service not initialized' }
                }
                const hosts = lanService.getHosts()
                return {
                    success: true,
                    count: hosts.length,
                    lastUpdate: lanService.getLastUpdate().toISOString(),
                    hosts: hosts.map((h) => h.toJSON())
                }
            })

            /**
             * 查询设备状态
             * GET /lan/query?mac=xxx&ip=xxx
             */
            instance.get('/query', async (request) => {
                const lanService = getLanService()
                if (!lanService) {
                    return { success: false, error: 'LAN service not initialized' }
                }
                const query = request.query as { mac?: string; ip?: string }
                const host = lanService.findHost(query.mac, query.ip)
                if (host) {
                    return { success: true, online: true, host: host.toJSON() }
                }
                return { success: true, online: false, host: null, query }
            })

            /**
             * 获取 LAN 服务状态
             * GET /lan/status
             */
            instance.get('/status', async () => {
                const lanService = getLanService()
                if (!lanService) {
                    return { success: false, error: 'LAN service not initialized' }
                }
                return { success: true, ...lanService.getStatus() }
            })
        },
        { prefix: '/lan' }
    )

    /**
     * 消息管理接口
     * 前缀: /msg
     */
    fastify.register(
        async (instance) => {
            /**
             * 查询消息列表
             * GET /msg/messages
             *
             * 查询参数:
             * - platform: 按平台筛选
             * - chatid: 按会话 ID 筛选
             * - userid: 按用户 ID 筛选
             * - direction: 按消息方向筛选 (in/out)
             * - msgtype: 按消息类型筛选
             * - keyword: 按关键词搜索
             * - last: 查询最近时间段的消息，格式: 数字+单位
             *         例如: "5m"(5分钟)、"30m"(30分钟)、"2h"(2小时)、"3d"(3天)
             * - startDate: 开始日期 (与 last 互斥，last 优先)
             * - endDate: 结束日期
             * - limit: 返回数量限制，默认 50
             * - offset: 偏移量，用于分页
             */
            instance.get('/messages', async (request) => {
                const query = request.query as MessageQuery
                const messages = queryMessages(query)
                const total = countMessages(query)
                return {
                    success: true,
                    total,
                    limit: query.limit || 50,
                    offset: query.offset || 0,
                    messages
                }
            })

            /**
             * 获取单条消息
             * GET /msg/messages/:id
             */
            instance.get('/messages/:id', async (request) => {
                const params = request.params as { id: string }
                const message = getMessageById(parseInt(params.id, 10))
                if (!message) {
                    return { success: false, error: 'Message not found' }
                }
                return { success: true, message }
            })

            /**
             * 获取消息统计
             * GET /msg/stats
             */
            instance.get('/stats', async () => {
                const stats = getStats()
                return { success: true, ...stats }
            })

            /**
             * 查询 action 消息列表
             * GET /msg/actions
             *
             * action 消息: 收到的消息(direction='in') + text类型 + 以'/'开头
             *
             * 查询参数:
             * - platform: 按平台筛选
             * - chatid: 按会话 ID 筛选
             * - userid: 按用户 ID 筛选
             * - last: 查询最近时间段的消息，格式: 数字+单位
             *         例如: "5m"(5分钟)、"30m"(30分钟)、"2h"(2小时)、"3d"(3天)
             * - limit: 返回数量限制，默认 50
             * - offset: 偏移量，用于分页
             */
            instance.get('/actions', async (request) => {
                const query = request.query as MessageQuery
                const actionQuery: MessageQuery = {
                    ...query,
                    isAction: true
                }
                const messages = queryMessages(actionQuery)
                const total = countMessages(actionQuery)
                return {
                    success: true,
                    total,
                    limit: query.limit || 50,
                    offset: query.offset || 0,
                    messages
                }
            })

            /**
             * 删除指定日期前的消息
             * DELETE /msg/messages
             * Body: { before: "2024-01-01" }
             */
            instance.delete('/messages', async (request) => {
                const body = request.body as { before?: string } | undefined
                if (!body?.before) {
                    return { success: false, error: 'Missing "before" date parameter' }
                }
                const deleted = deleteMessagesBefore(body.before)
                return { success: true, deleted }
            })
        },
        { prefix: '/msg' }
    )

    /**
     * 缓存管理接口
     * 前缀: /cache
     */
    fastify.register(
        async (instance) => {
            /**
             * 获取缓存文件列表
             * GET /cache/files
             */
            instance.get('/files', async () => {
                const files = getCachedFiles()
                const stats = getCacheStats()
                return { success: true, ...stats, files }
            })

            /**
             * 清理指定日期前的缓存
             * DELETE /cache/files
             * Body: { before: "2024-01-01" }
             */
            instance.delete('/files', async (request) => {
                const body = request.body as { before?: string } | undefined
                if (!body?.before) {
                    return { success: false, error: 'Missing "before" date parameter' }
                }
                const deleted = clearCacheBefore(body.before)
                return { success: true, deleted }
            })

            /**
             * 删除指定缓存文件
             * DELETE /cache/files/:path
             */
            instance.delete('/files/:path', async (request) => {
                const params = request.params as { path: string }
                const decodedPath = decodeURIComponent(params.path)
                const deleted = deleteCachedFile(decodedPath)
                return { success: deleted }
            })
        },
        { prefix: '/cache' }
    )

    /**
     * 推送任务管理接口
     * 前缀: /push
     */
    fastify.register(
        async (instance) => {
            /**
             * 获取推送任务列表
             * GET /push/jobs
             */
            instance.get('/jobs', async () => {
                const jobs = pushService.getJobs()
                return { success: true, count: jobs.length, jobs }
            })

            /**
             * 获取单个任务详情
             * GET /push/jobs/:id
             */
            instance.get('/jobs/:id', async (request) => {
                const params = request.params as { id: string }
                const job = pushService.getJob(params.id)
                if (!job) {
                    return { success: false, error: 'Job not found' }
                }
                return { success: true, job }
            })

            /**
             * 立即执行任务
             * POST /push/jobs/:id/execute
             */
            instance.post('/jobs/:id/execute', async (request) => {
                const params = request.params as { id: string }
                const success = await pushService.executeJob(params.id)
                return { success }
            })

            /**
             * 启用任务
             * POST /push/jobs/:id/enable
             */
            instance.post('/jobs/:id/enable', async (request) => {
                const params = request.params as { id: string }
                const success = pushService.enableJob(params.id)
                return { success }
            })

            /**
             * 禁用任务
             * POST /push/jobs/:id/disable
             */
            instance.post('/jobs/:id/disable', async (request) => {
                const params = request.params as { id: string }
                const success = pushService.disableJob(params.id)
                return { success }
            })

            /**
             * 删除任务
             * DELETE /push/jobs/:id
             */
            instance.delete('/jobs/:id', async (request) => {
                const params = request.params as { id: string }
                const success = pushService.removeJob(params.id)
                return { success }
            })
        },
        { prefix: '/push' }
    )

    /**
     * 推送 API 接口
     * 前缀: /api/push
     */
    fastify.register(
        async (instance) => {
            await registerPushApiRoutes(instance)
        },
        { prefix: '/api/push' }
    )

    return fastify
}
