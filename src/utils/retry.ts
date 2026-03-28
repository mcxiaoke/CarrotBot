/**
 * 重试辅助模块
 *
 * 提供通用的重试机制，用于网络请求等可能失败的操作。
 */

import { logger } from '../logger.js'

/**
 * 重试配置接口
 */
export interface RetryOptions {
    /** 最大重试次数，默认 3 */
    maxRetries?: number
    /** 基础延迟时间（毫秒），默认 1000 */
    baseDelay?: number
    /** 是否使用指数退避，默认 true */
    exponentialBackoff?: boolean
    /** 操作名称，用于日志 */
    operationName?: string
}

/**
 * 判断错误是否可重试
 *
 * 网络错误、超时错误等通常可以重试。
 *
 * @param err - 错误对象
 * @returns 是否可重试
 */
function isRetryableError(err: unknown): boolean {
    if (err instanceof Error) {
        const message = err.message.toLowerCase()
        const retryablePatterns = [
            'network',
            'timeout',
            'econnrefused',
            'econnreset',
            'enotfound',
            'etimedout',
            'socket hang up',
            'fetch failed',
            'bad gateway',
            'service unavailable',
            'gateway timeout',
            'too many requests',
            '429',
            '500',
            '502',
            '503',
            '504'
        ]
        return retryablePatterns.some((pattern) => message.includes(pattern))
    }
    return false
}

/**
 * 延迟执行
 * @param ms - 延迟毫秒数
 */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 带重试的异步操作执行器
 *
 * 自动重试失败的操作，支持指数退避策略。
 *
 * @param fn - 要执行的异步函数
 * @param options - 重试配置
 * @returns 函数执行结果
 * @throws 所有重试失败后抛出最后一次错误
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => await bot.sendMessage(chatId, content),
 *   { maxRetries: 3, baseDelay: 1000, operationName: 'sendMessage' }
 * );
 * ```
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        exponentialBackoff = true,
        operationName = 'operation'
    } = options

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn()
        } catch (err) {
            lastError = err as Error

            const isRetryable = isRetryableError(err)
            const isLastAttempt = attempt === maxRetries

            if (!isRetryable || isLastAttempt) {
                logger.error(
                    { err: lastError.message, attempt, maxRetries, operationName },
                    `${operationName} failed${isLastAttempt ? ' after all retries' : ''}`
                )
                throw err
            }

            const delayMs = exponentialBackoff ? baseDelay * Math.pow(2, attempt - 1) : baseDelay
            logger.warn(
                {
                    err: lastError.message,
                    attempt,
                    maxRetries,
                    delayMs,
                    operationName
                },
                `${operationName} failed, retrying...`
            )

            await delay(delayMs)
        }
    }

    throw lastError
}
