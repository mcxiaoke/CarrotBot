/**
 * 文件缓存管理模块
 *
 * 本模块提供媒体文件的缓存管理，包括下载、保存、查询和清理功能。
 * 媒体文件按日期和平台分类存储，便于管理和清理。
 */

import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs'
import { join, dirname } from 'path'
import { writeFile, readFile } from 'fs/promises'
import axios from 'axios'
import { logger } from '../logger.js'

/**
 * 缓存配置接口
 */
export interface CacheConfig {
    /** 缓存根目录路径 */
    cachePath: string
}

/**
 * 缓存文件信息接口
 */
export interface CachedFile {
    /** 文件完整路径 */
    path: string
    /** 文件名 */
    filename: string
    /** 文件大小（字节） */
    size: number
    /** 创建时间 */
    createdAt: Date
}

/** 缓存根目录路径 */
let cachePath = './data/cache'

/**
 * 初始化缓存
 *
 * 创建缓存目录结构。
 *
 * @param config - 缓存配置
 */
export function initCache(config: CacheConfig): void {
    cachePath = config.cachePath
    mkdirSync(cachePath, { recursive: true })
    mkdirSync(join(cachePath, 'media'), { recursive: true })
    logger.info(`Cache initialized: ${cachePath}`)
}

/**
 * 获取日期目录路径
 *
 * 按日期创建子目录，格式：YYYY-MM-DD
 *
 * @param platform - 平台标识（可选）
 * @returns 日期目录路径
 */
function getDatePath(platform?: string): string {
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const dir = platform
        ? join(cachePath, 'media', platform, dateStr)
        : join(cachePath, 'media', dateStr)
    mkdirSync(dir, { recursive: true })
    return dir
}

/**
 * 生成唯一文件名
 *
 * 格式：类型_时间戳_随机字符.扩展名
 *
 * @param type - 媒体类型
 * @param ext - 文件扩展名
 * @returns 文件名
 */
function generateFilename(type: string, ext: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `${type}_${timestamp}_${random}.${ext}`
}

/**
 * 从 URL 提取文件扩展名
 *
 * @param url - 文件 URL
 * @param defaultExt - 默认扩展名
 * @returns 扩展名
 */
function getExtensionFromUrl(url: string, defaultExt: string): string {
    const match = url.match(/\.(\w+)(?:\?|$)/)
    return match ? match[1] : defaultExt
}

/**
 * 从 MIME 类型获取文件扩展名
 *
 * @param mime - MIME 类型
 * @returns 扩展名
 */
function getExtensionFromMime(mime: string): string {
    const map: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'audio/amr': 'amr',
        'audio/mp3': 'mp3',
        'audio/mpeg': 'mp3',
        'video/mp4': 'mp4',
        'application/pdf': 'pdf'
    }
    return map[mime] || 'bin'
}

/**
 * 下载媒体文件
 *
 * 从 URL 下载媒体文件并保存到缓存目录。
 *
 * @param url - 文件下载 URL
 * @param type - 媒体类型
 * @param aesKey - AES 解密密钥（可选，企业微信需要）
 * @param platform - 平台标识（可选）
 * @returns 文件路径、文件名和大小
 */
export async function downloadMedia(
    url: string,
    type: 'image' | 'voice' | 'video' | 'file',
    aesKey?: string,
    platform?: string
): Promise<{ path: string; filename: string; size: number }> {
    const datePath = getDatePath(platform)
    const ext = getExtensionFromUrl(
        url,
        type === 'image' ? 'jpg' : type === 'voice' ? 'amr' : type === 'video' ? 'mp4' : 'bin'
    )
    const filename = generateFilename(type, ext)
    const filePath = join(datePath, filename)

    try {
        logger.debug({ url, type, platform }, 'Downloading media')
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
        const buffer = Buffer.from(response.data)

        await writeFile(filePath, buffer)

        logger.debug({ path: filePath, size: buffer.length, platform }, 'Downloaded media')
        return { path: filePath, filename, size: buffer.length }
    } catch (error) {
        logger.error({ error, url, platform }, 'Failed to download media')
        throw error
    }
}

/**
 * 保存二进制数据到缓存
 *
 * 将内存中的二进制数据保存到缓存目录。
 *
 * @param buffer - 文件二进制数据
 * @param type - 媒体类型
 * @param ext - 文件扩展名（可选）
 * @param platform - 平台标识（可选）
 * @returns 文件路径、文件名和大小
 */
export async function saveBuffer(
    buffer: Buffer,
    type: 'image' | 'voice' | 'video' | 'file',
    ext?: string,
    platform?: string
): Promise<{ path: string; filename: string; size: number }> {
    const datePath = getDatePath(platform)
    const actualExt =
        ext ||
        (type === 'image' ? 'jpg' : type === 'voice' ? 'amr' : type === 'video' ? 'mp4' : 'bin')
    const filename = generateFilename(type, actualExt)
    const filePath = join(datePath, filename)

    await writeFile(filePath, buffer)

    logger.debug({ path: filePath, size: buffer.length, platform }, 'Saved buffer')
    return { path: filePath, filename, size: buffer.length }
}

/**
 * 获取缓存文件列表
 *
 * 递归获取缓存目录中的所有文件。
 *
 * @param platform - 平台标识（可选，仅获取指定平台的文件）
 * @returns 缓存文件列表
 */
export function getCachedFiles(platform?: string): CachedFile[] {
    const mediaPath = join(cachePath, 'media')
    if (!existsSync(mediaPath)) return []

    const files: CachedFile[] = []

    /**
     * 递归收集文件
     * @param dir - 目录路径
     */
    const collectFiles = (dir: string) => {
        if (!existsSync(dir)) return
        const entries = readdirSync(dir)

        for (const entry of entries) {
            const entryPath = join(dir, entry)
            const stat = statSync(entryPath)

            if (stat.isDirectory()) {
                collectFiles(entryPath)
            } else {
                files.push({
                    path: entryPath,
                    filename: entry,
                    size: stat.size,
                    createdAt: new Date(stat.birthtime)
                })
            }
        }
    }

    // 根据平台参数决定遍历范围
    if (platform) {
        const platformPath = join(mediaPath, platform)
        collectFiles(platformPath)
    } else {
        collectFiles(mediaPath)
    }

    // 按创建时间降序排序
    return files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

/**
 * 删除缓存文件
 *
 * @param path - 文件路径
 * @returns 是否删除成功
 */
export function deleteCachedFile(path: string): boolean {
    try {
        if (existsSync(path)) {
            unlinkSync(path)
            logger.debug({ path }, 'Deleted cached file')
            return true
        }
        return false
    } catch (error) {
        logger.error({ error, path }, 'Failed to delete cached file')
        return false
    }
}

/**
 * 清理指定日期之前的缓存
 *
 * 删除早于指定日期的缓存文件和空目录。
 *
 * @param date - 日期字符串
 * @param platform - 平台标识（可选）
 * @returns 删除的文件数
 */
export function clearCacheBefore(date: string, platform?: string): number {
    const mediaPath = join(cachePath, 'media')
    if (!existsSync(mediaPath)) return 0

    let deleted = 0

    /**
     * 递归清理目录
     * @param dir - 目录路径
     * @param isPlatformDir - 是否为平台目录
     */
    const clearDir = (dir: string, isPlatformDir: boolean = false) => {
        if (!existsSync(dir)) return
        const entries = readdirSync(dir)

        for (const entry of entries) {
            const entryPath = join(dir, entry)
            const stat = statSync(entryPath)

            if (stat.isDirectory()) {
                // 平台目录或日期目录早于指定日期时递归清理
                if (isPlatformDir || entry < date) {
                    clearDir(entryPath)
                    try {
                        rmdirSync(entryPath)
                        logger.info({ dir: entryPath }, 'Cleared cache directory')
                    } catch {
                        // 目录非空，忽略
                    }
                }
            } else if (!isPlatformDir && entry < date) {
                // 删除早于指定日期的文件
                unlinkSync(entryPath)
                deleted++
            }
        }
    }

    if (platform) {
        const platformPath = join(mediaPath, platform)
        clearDir(platformPath, true)
    } else {
        clearDir(mediaPath)
    }

    return deleted
}

/**
 * 获取缓存统计信息
 *
 * @param platform - 平台标识（可选）
 * @returns 统计信息
 */
export function getCacheStats(platform?: string): {
    totalFiles: number
    totalSize: number
    byType: Record<string, number>
    byPlatform: Record<string, number>
} {
    const files = getCachedFiles(platform)
    const byType: Record<string, number> = {}
    const byPlatform: Record<string, number> = {}

    for (const file of files) {
        // 按文件类型统计（从文件名前缀提取）
        const type = file.filename.split('_')[0] || 'unknown'
        byType[type] = (byType[type] || 0) + 1

        // 按平台统计（从路径提取）
        const pathParts = file.path.split(/[/\\]/)
        const mediaIndex = pathParts.findIndex((p) => p === 'media')
        if (mediaIndex >= 0 && pathParts[mediaIndex + 1]) {
            const potentialPlatform = pathParts[mediaIndex + 1]
            // 排除日期格式的目录
            if (!potentialPlatform.match(/^\d{4}-\d{2}-\d{2}$/)) {
                byPlatform[potentialPlatform] = (byPlatform[potentialPlatform] || 0) + 1
            }
        }
    }

    return {
        totalFiles: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        byType,
        byPlatform
    }
}

/**
 * 获取缓存根目录路径
 * @returns 缓存根目录路径
 */
export function getCachePath(): string {
    return cachePath
}
