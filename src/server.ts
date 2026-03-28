/**
 * HTTP 服务器模块
 *
 * 本模块创建并配置 Fastify HTTP 服务器，提供 RESTful API 接口。
 *
 * 路由结构:
 * - /                  服务信息（公开）
 * - /health            健康检查（公开）
 * - /admin             管理页面（公开，HTML）
 * - /api/*             JSON API 接口（需要 token 认证）
 *
 * 认证方式:
 * - GET/DELETE: 通过 query 参数传递 token (?token=xxx)
 * - POST: 通过 body 传递 token ({ token: "xxx", ... })
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
 * API 接口文档定义
 */
interface ApiEndpoint {
    method: string
    path: string
    description: string
    params?: Record<string, { type: string; required: boolean; description: string }>
    body?: Record<string, { type: string; required: boolean; description: string }>
    response?: Record<string, { type: string; description: string }>
}

const API_DOCS: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/docs',
        description: '获取 API 接口文档列表',
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            endpoints: { type: 'array', description: '接口列表' }
        }
    },
    {
        method: 'GET',
        path: '/api/lan/devices',
        description: '获取局域网在线设备列表',
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            count: { type: 'number', description: '设备数量' },
            lastUpdate: { type: 'string', description: '最后更新时间 (ISO 8601)' },
            hosts: { type: 'array', description: '设备列表' }
        }
    },
    {
        method: 'GET',
        path: '/api/lan/query',
        description: '查询指定设备状态',
        params: {
            mac: { type: 'string', required: false, description: '设备 MAC 地址' },
            ip: { type: 'string', required: false, description: '设备 IP 地址' }
        },
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            online: { type: 'boolean', description: '设备是否在线' },
            host: { type: 'object', description: '设备信息（在线时）' }
        }
    },
    {
        method: 'GET',
        path: '/api/lan/status',
        description: '获取局域网服务状态',
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            connected: { type: 'boolean', description: '是否已连接路由器' },
            pollingInterval: { type: 'number', description: '轮询间隔（秒）' }
        }
    },
    {
        method: 'GET',
        path: '/api/msg/messages',
        description: '查询消息列表（支持分页和筛选）',
        params: {
            platform: { type: 'string', required: false, description: '按平台筛选 (wecom/telegram)' },
            chatid: { type: 'string', required: false, description: '按会话 ID 筛选' },
            userid: { type: 'string', required: false, description: '按用户 ID 筛选' },
            direction: { type: 'string', required: false, description: '按消息方向筛选 (in/out)' },
            msgtype: { type: 'string', required: false, description: '按消息类型筛选' },
            keyword: { type: 'string', required: false, description: '按关键词搜索' },
            last: { type: 'string', required: false, description: '最近时间段 (如 5m, 2h, 3d)' },
            startDate: { type: 'string', required: false, description: '开始日期 (YYYY-MM-DD)' },
            endDate: { type: 'string', required: false, description: '结束日期 (YYYY-MM-DD)' },
            limit: { type: 'number', required: false, description: '返回数量限制，默认 50' },
            offset: { type: 'number', required: false, description: '偏移量，用于分页' }
        },
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            total: { type: 'number', description: '总数量' },
            messages: { type: 'array', description: '消息列表' }
        }
    },
    {
        method: 'GET',
        path: '/api/msg/messages/:id',
        description: '获取单条消息详情',
        params: {
            id: { type: 'number', required: true, description: '消息 ID' }
        },
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            message: { type: 'object', description: '消息详情' }
        }
    },
    {
        method: 'GET',
        path: '/api/msg/stats',
        description: '获取消息统计信息',
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            total: { type: 'number', description: '消息总数' },
            byPlatform: { type: 'object', description: '按平台统计' },
            byDirection: { type: 'object', description: '按方向统计' }
        }
    },
    {
        method: 'GET',
        path: '/api/msg/actions',
        description: '查询命令消息列表（收到的以 / 开头的文本消息）',
        params: {
            platform: { type: 'string', required: false, description: '按平台筛选' },
            chatid: { type: 'string', required: false, description: '按会话 ID 筛选' },
            userid: { type: 'string', required: false, description: '按用户 ID 筛选' },
            last: { type: 'string', required: false, description: '最近时间段' },
            limit: { type: 'number', required: false, description: '返回数量限制' },
            offset: { type: 'number', required: false, description: '偏移量' }
        },
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            total: { type: 'number', description: '总数量' },
            messages: { type: 'array', description: '消息列表' }
        }
    },
    {
        method: 'DELETE',
        path: '/api/msg/messages',
        description: '删除指定日期之前的消息',
        body: {
            before: { type: 'string', required: true, description: '截止日期 (YYYY-MM-DD)' }
        },
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            deleted: { type: 'number', description: '删除数量' }
        }
    },
    {
        method: 'GET',
        path: '/api/cache/files',
        description: '获取缓存文件列表',
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            count: { type: 'number', description: '文件数量' },
            totalSize: { type: 'number', description: '总大小（字节）' },
            files: { type: 'array', description: '文件列表' }
        }
    },
    {
        method: 'DELETE',
        path: '/api/cache/files',
        description: '清理指定日期之前的缓存文件',
        body: {
            before: { type: 'string', required: true, description: '截止日期 (YYYY-MM-DD)' }
        },
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            deleted: { type: 'number', description: '删除数量' }
        }
    },
    {
        method: 'DELETE',
        path: '/api/cache/files/:path',
        description: '删除指定缓存文件',
        params: {
            path: { type: 'string', required: true, description: '文件路径（URL 编码）' }
        },
        response: {
            success: { type: 'boolean', description: '是否删除成功' }
        }
    },
    {
        method: 'GET',
        path: '/api/push/jobs',
        description: '获取推送任务列表',
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            count: { type: 'number', description: '任务数量' },
            jobs: { type: 'array', description: '任务列表' }
        }
    },
    {
        method: 'GET',
        path: '/api/push/jobs/:id',
        description: '获取单个推送任务详情',
        params: {
            id: { type: 'string', required: true, description: '任务 ID' }
        },
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            job: { type: 'object', description: '任务详情' }
        }
    },
    {
        method: 'POST',
        path: '/api/push/jobs/:id/execute',
        description: '立即执行指定推送任务',
        params: {
            id: { type: 'string', required: true, description: '任务 ID' }
        },
        response: {
            success: { type: 'boolean', description: '是否执行成功' }
        }
    },
    {
        method: 'POST',
        path: '/api/push/jobs/:id/enable',
        description: '启用指定推送任务',
        params: {
            id: { type: 'string', required: true, description: '任务 ID' }
        },
        response: {
            success: { type: 'boolean', description: '是否启用成功' }
        }
    },
    {
        method: 'POST',
        path: '/api/push/jobs/:id/disable',
        description: '禁用指定推送任务',
        params: {
            id: { type: 'string', required: true, description: '任务 ID' }
        },
        response: {
            success: { type: 'boolean', description: '是否禁用成功' }
        }
    },
    {
        method: 'DELETE',
        path: '/api/push/jobs/:id',
        description: '删除指定推送任务',
        params: {
            id: { type: 'string', required: true, description: '任务 ID' }
        },
        response: {
            success: { type: 'boolean', description: '是否删除成功' }
        }
    },
    {
        method: 'POST',
        path: '/api/push/send',
        description: '发送消息到指定平台',
        body: {
            platform: { type: 'string', required: true, description: '目标平台 (wecom/telegram)' },
            content: { type: 'string', required: true, description: '消息内容' },
            type: { type: 'string', required: false, description: '内容类型 (text/markdown)，默认 text' }
        },
        response: {
            success: { type: 'boolean', description: '是否发送成功' },
            platform: { type: 'string', description: '目标平台' },
            type: { type: 'string', description: '内容类型' }
        }
    },
    {
        method: 'POST',
        path: '/api/push/send/all',
        description: '广播消息到所有可用平台',
        body: {
            content: { type: 'string', required: true, description: '消息内容' },
            type: { type: 'string', required: false, description: '内容类型 (text/markdown)，默认 text' }
        },
        response: {
            success: { type: 'boolean', description: '是否全部发送成功' },
            results: { type: 'array', description: '各平台发送结果' }
        }
    },
    {
        method: 'GET',
        path: '/api/push/status',
        description: '获取推送平台配置状态',
        response: {
            success: { type: 'boolean', description: '请求是否成功' },
            platforms: { type: 'object', description: '平台状态信息' }
        }
    }
]

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
     * 服务信息接口
     * GET /
     * 公开接口，无需认证
     */
    fastify.get('/', async () => {
        return { name: 'CarrotBot', version: '1.0.0' }
    })

    /**
     * 健康检查接口
     * GET /health
     * 公开接口，无需认证
     */
    fastify.get('/health', async () => {
        return { status: 'ok', uptime: process.uptime() }
    })

    /**
     * 管理页面路由
     * 公开接口，返回 HTML 页面
     */
    fastify.register(registerAdminRoutes)

    /**
     * API 接口路由
     * 前缀: /api
     * 所有接口需要 token 认证
     */
    fastify.register(
        async (instance) => {
            /**
             * API 文档接口
             * GET /api/docs
             * 返回所有可用接口的文档说明
             */
            instance.get('/docs', async () => {
                return {
                    success: true,
                    authentication: {
                        required: true,
                        methods: {
                            GET_DELETE: '通过 query 参数传递 token (?token=xxx)',
                            POST: '通过 body 传递 token ({ token: "xxx", ... })'
                        }
                    },
                    endpoints: API_DOCS
                }
            })

            /**
             * LAN 设备管理接口
             * 前缀: /api/lan
             */
            instance.register(
                async (lanInstance) => {
                    /**
                     * 获取在线设备列表
                     * GET /api/lan/devices
                     */
                    lanInstance.get('/devices', async () => {
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
                     * GET /api/lan/query?mac=xxx&ip=xxx
                     */
                    lanInstance.get('/query', async (request) => {
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
                     * GET /api/lan/status
                     */
                    lanInstance.get('/status', async () => {
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
             * 前缀: /api/msg
             */
            instance.register(
                async (msgInstance) => {
                    /**
                     * 查询消息列表
                     * GET /api/msg/messages
                     */
                    msgInstance.get('/messages', async (request) => {
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
                     * GET /api/msg/messages/:id
                     */
                    msgInstance.get('/messages/:id', async (request) => {
                        const params = request.params as { id: string }
                        const message = getMessageById(parseInt(params.id, 10))
                        if (!message) {
                            return { success: false, error: 'Message not found' }
                        }
                        return { success: true, message }
                    })

                    /**
                     * 获取消息统计
                     * GET /api/msg/stats
                     */
                    msgInstance.get('/stats', async () => {
                        const stats = getStats()
                        return { success: true, ...stats }
                    })

                    /**
                     * 查询 action 消息列表
                     * GET /api/msg/actions
                     */
                    msgInstance.get('/actions', async (request) => {
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
                     * DELETE /api/msg/messages
                     */
                    msgInstance.delete('/messages', async (request) => {
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
             * 前缀: /api/cache
             */
            instance.register(
                async (cacheInstance) => {
                    /**
                     * 获取缓存文件列表
                     * GET /api/cache/files
                     */
                    cacheInstance.get('/files', async () => {
                        const files = getCachedFiles()
                        const stats = getCacheStats()
                        return { success: true, ...stats, files }
                    })

                    /**
                     * 清理指定日期前的缓存
                     * DELETE /api/cache/files
                     */
                    cacheInstance.delete('/files', async (request) => {
                        const body = request.body as { before?: string } | undefined
                        if (!body?.before) {
                            return { success: false, error: 'Missing "before" date parameter' }
                        }
                        const deleted = clearCacheBefore(body.before)
                        return { success: true, deleted }
                    })

                    /**
                     * 删除指定缓存文件
                     * DELETE /api/cache/files/:path
                     */
                    cacheInstance.delete('/files/:path', async (request) => {
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
             * 前缀: /api/push
             */
            instance.register(
                async (pushInstance) => {
                    /**
                     * 获取推送任务列表
                     * GET /api/push/jobs
                     */
                    pushInstance.get('/jobs', async () => {
                        const jobs = pushService.getJobs()
                        return { success: true, count: jobs.length, jobs }
                    })

                    /**
                     * 获取单个任务详情
                     * GET /api/push/jobs/:id
                     */
                    pushInstance.get('/jobs/:id', async (request) => {
                        const params = request.params as { id: string }
                        const job = pushService.getJob(params.id)
                        if (!job) {
                            return { success: false, error: 'Job not found' }
                        }
                        return { success: true, job }
                    })

                    /**
                     * 立即执行任务
                     * POST /api/push/jobs/:id/execute
                     */
                    pushInstance.post('/jobs/:id/execute', async (request) => {
                        const params = request.params as { id: string }
                        const success = await pushService.executeJob(params.id)
                        return { success }
                    })

                    /**
                     * 启用任务
                     * POST /api/push/jobs/:id/enable
                     */
                    pushInstance.post('/jobs/:id/enable', async (request) => {
                        const params = request.params as { id: string }
                        const success = pushService.enableJob(params.id)
                        return { success }
                    })

                    /**
                     * 禁用任务
                     * POST /api/push/jobs/:id/disable
                     */
                    pushInstance.post('/jobs/:id/disable', async (request) => {
                        const params = request.params as { id: string }
                        const success = pushService.disableJob(params.id)
                        return { success }
                    })

                    /**
                     * 删除任务
                     * DELETE /api/push/jobs/:id
                     */
                    pushInstance.delete('/jobs/:id', async (request) => {
                        const params = request.params as { id: string }
                        const success = pushService.removeJob(params.id)
                        return { success }
                    })

                    /**
                     * 推送发送接口
                     */
                    await registerPushApiRoutes(pushInstance)
                },
                { prefix: '/push' }
            )
        },
        { prefix: '/api' }
    )

    return fastify
}
