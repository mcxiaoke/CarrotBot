/**
 * API 认证模块
 *
 * 提供统一的 API Token 验证功能，用于保护所有 API 接口。
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { logger } from './logger.js'

/** 不需要认证的路径列表 */
const PUBLIC_PATHS = ['/', '/health', '/admin', '/favicon.ico']

/**
 * 获取 API 认证令牌
 *
 * 延迟读取环境变量，确保 dotenv.config() 已执行
 *
 * @returns API 令牌
 */
function getApiToken(): string {
    return process.env.API_TOKEN || ''
}

/**
 * 验证 API 令牌
 *
 * @param token - 待验证的令牌
 * @returns 是否有效
 */
export function validateToken(token: string): boolean {
    const API_TOKEN = getApiToken()
    if (!API_TOKEN) {
        logger.warn('API_TOKEN not configured')
        return false
    }
    return token === API_TOKEN
}

/**
 * Fastify 认证钩子
 *
 * 验证请求中的 token 参数（query 或 body）
 *
 * @param request - Fastify 请求对象
 * @param reply - Fastify 响应对象
 * @returns 是否通过认证
 */
export async function authHook(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const path = request.routeOptions.url || request.url

    if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
        return
    }

    let token: string | undefined

    if (request.method === 'GET' || request.method === 'DELETE') {
        const query = request.query as Record<string, string | undefined>
        token = query?.token
    } else {
        const body = request.body as Record<string, string | undefined> | undefined
        token = body?.token
    }

    if (!token) {
        logger.warn({ ip: request.ip, path }, 'API request missing token')
        return reply.code(401).send({ success: false, error: 'Token required' })
    }

    if (!validateToken(token)) {
        logger.warn({ ip: request.ip, path }, 'API request with invalid token')
        return reply.code(401).send({ success: false, error: 'Invalid token' })
    }
}
