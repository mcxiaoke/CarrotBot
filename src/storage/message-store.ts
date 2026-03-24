/**
 * 消息存储统一接口模块
 *
 * 本模块提供消息存储的统一入口，整合数据库存储和文件缓存功能。
 * 负责消息的持久化存储和媒体文件的下载缓存。
 */

import type { StandardMessage } from '../core/types.js'
import {
    initDatabase,
    saveMessage,
    queryMessages,
    getMessageById,
    getMessageByMsgid,
    countMessages,
    deleteMessagesBefore,
    getStats,
    closeDatabase,
    type MessageRecord,
    type MessageQuery
} from './database.js'
import {
    initCache,
    downloadMedia,
    saveBuffer,
    getCachedFiles,
    deleteCachedFile,
    clearCacheBefore,
    getCacheStats,
    getCachePath,
    type CacheConfig,
    type CachedFile
} from './cache.js'
import { logger } from '../logger.js'

/**
 * 消息存储配置接口
 */
export interface MessageStoreConfig {
    /** 数据库文件路径 */
    dbPath: string
    /** 缓存目录路径 */
    cachePath: string
}

/**
 * 企业微信文件下载函数类型
 */
export type WeComDownloadFn = (
    url: string,
    aesKey: string
) => Promise<{ buffer: Buffer; filename?: string }>

/**
 * Telegram 文件下载函数类型
 */
export type TelegramDownloadFn = (fileId: string) => Promise<{ buffer: Buffer; filename?: string }>

/** 是否已初始化 */
let initialized = false

/**
 * 初始化消息存储
 *
 * 初始化数据库和文件缓存。
 *
 * @param config - 存储配置
 */
export function initMessageStore(config: MessageStoreConfig): void {
    if (initialized) return

    initDatabase(config.dbPath)
    initCache({ cachePath: config.cachePath })
    initialized = true
    logger.info('MessageStore initialized')
}

/**
 * 关闭消息存储
 *
 * 关闭数据库连接。
 */
export function closeMessageStore(): void {
    closeDatabase()
    initialized = false
}

/**
 * 保存接收到的消息
 *
 * 将消息保存到数据库，如果是媒体消息则下载并缓存媒体文件。
 *
 * @param msg - 标准消息对象
 * @param downloadMediaFn - 媒体文件下载函数（可选）
 * @returns 插入记录的 ID
 */
export async function saveIncomingMessage(
    msg: StandardMessage,
    downloadMediaFn?: WeComDownloadFn | TelegramDownloadFn
): Promise<number> {
    let mediaPath: string | null = null
    const raw = msg.raw as Record<string, unknown>
    const body = (raw?.body as Record<string, unknown>) || {}
    const msgid =
        (body.msgid as string | undefined) ||
        (raw as { message_id?: number })?.message_id?.toString()

    logger.debug(
        {
            platform: msg.platform,
            msgType: msg.msgType,
            mediaUrl: msg.mediaUrl,
            aesKey: msg.aesKey,
            hasDownloadFn: !!downloadMediaFn
        },
        'saveIncomingMessage called'
    )

    // 处理媒体文件下载
    if (msg.msgType !== 'text' && msg.msgType !== 'event' && msg.mediaUrl) {
        try {
            const type = msg.msgType as 'image' | 'voice' | 'video' | 'file'

            if (msg.platform === 'telegram') {
                // Telegram 平台：使用 file_id 下载
                logger.debug({ fileId: msg.mediaUrl }, 'Downloading Telegram media')
                if (downloadMediaFn) {
                    const { buffer, filename } = await (downloadMediaFn as TelegramDownloadFn)(
                        msg.mediaUrl
                    )
                    const ext = filename?.split('.').pop()
                    const result = await saveBuffer(buffer, type, ext, msg.platform)
                    mediaPath = result.path
                }
            } else if (msg.platform === 'wecom' && msg.aesKey) {
                // 企业微信平台：使用 URL 和 AES 密钥下载
                logger.debug(
                    { url: msg.mediaUrl, hasAesKey: !!msg.aesKey },
                    'Downloading WeCom media'
                )
                if (downloadMediaFn) {
                    const { buffer, filename } = await (downloadMediaFn as WeComDownloadFn)(
                        msg.mediaUrl,
                        msg.aesKey
                    )
                    const ext = filename?.split('.').pop()
                    const result = await saveBuffer(buffer, type, ext, msg.platform)
                    mediaPath = result.path
                } else {
                    // 没有下载函数时直接下载
                    const result = await downloadMedia(msg.mediaUrl, type, msg.aesKey, msg.platform)
                    mediaPath = result.path
                }
            } else {
                logger.debug(
                    { platform: msg.platform, msgType: msg.msgType },
                    'Media download skipped: unsupported platform or missing keys'
                )
            }

            if (mediaPath) {
                logger.info(
                    { platform: msg.platform, msgType: msg.msgType, mediaPath },
                    'Media downloaded successfully'
                )
            }
        } catch (error) {
            logger.error(
                { error, msgid, platform: msg.platform, msgType: msg.msgType },
                'Failed to download media for incoming message'
            )
        }
    }

    // 提取会话和用户信息
    const chatid =
        (body.chatid as string) || (raw as { chat?: { id?: number } })?.chat?.id?.toString()
    const userid =
        ((body.from as Record<string, unknown>)?.userid as string) ||
        (raw as { from?: { id?: number } })?.from?.id?.toString()

    // 保存消息到数据库
    const id = saveMessage({
        msgid: msgid || undefined,
        platform: msg.platform,
        chatid,
        userid,
        direction: 'in',
        msgtype: msg.msgType,
        content: msg.msgType === 'text' ? msg.content : null,
        media_id: msg.mediaKey || msg.mediaUrl || null,
        media_path: mediaPath,
        raw: JSON.stringify(raw)
    })

    logger.debug(
        { id, msgid, msgtype: msg.msgType, platform: msg.platform, mediaPath },
        'Saved incoming message'
    )
    return id
}

/**
 * 保存发送的消息
 *
 * 将发送的消息记录到数据库。
 *
 * @param msg - 标准消息对象
 * @param msgtype - 消息类型
 * @param content - 消息内容
 * @param mediaId - 媒体文件 ID（可选）
 * @param mediaPath - 媒体文件路径（可选）
 * @returns 插入记录的 ID
 */
export async function saveOutgoingMessage(
    msg: StandardMessage,
    msgtype: string,
    content: string | null,
    mediaId?: string,
    mediaPath?: string
): Promise<number> {
    const raw = msg.raw as Record<string, unknown>
    const body = (raw?.body as Record<string, unknown>) || {}

    const id = saveMessage({
        msgid: undefined,
        platform: msg.platform,
        chatid: body.chatid as string,
        userid: (body.from as Record<string, unknown>)?.userid as string,
        direction: 'out',
        msgtype,
        content,
        media_id: mediaId || null,
        media_path: mediaPath || null,
        raw: null
    })

    logger.debug({ id, msgtype, direction: 'out' }, 'Saved outgoing message')
    return id
}

// 重新导出数据库和缓存模块的接口
export { queryMessages, getMessageById, getMessageByMsgid, countMessages, getStats }
export { getCachedFiles, deleteCachedFile, clearCacheBefore, getCacheStats, getCachePath }
export type { MessageRecord, MessageQuery, CachedFile }
