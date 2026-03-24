/**
 * SQLite 数据库操作模块
 *
 * 本模块提供消息存储的数据库操作，使用 better-sqlite3 进行同步的 SQLite 数据库访问。
 * 支持消息的增删改查和统计功能。
 */

import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { logger } from '../logger.js'

/**
 * 消息记录接口
 *
 * 定义数据库中消息表的字段结构
 */
export interface MessageRecord {
    /** 自增主键 */
    id: number
    /** 消息唯一标识（平台提供） */
    msgid: string | null
    /** 平台标识 */
    platform: string
    /** 会话 ID */
    chatid: string | null
    /** 用户 ID */
    userid: string | null
    /** 消息方向：in-接收，out-发送 */
    direction: 'in' | 'out'
    /** 消息类型 */
    msgtype: string
    /** 消息内容 */
    content: string | null
    /** 媒体文件 ID */
    media_id: string | null
    /** 媒体文件本地路径 */
    media_path: string | null
    /** 原始消息 JSON */
    raw: string | null
    /** 创建时间 */
    created_at: string
}

/**
 * 消息查询参数接口
 */
export interface MessageQuery {
    /** 按平台筛选 */
    platform?: string
    /** 按会话 ID 筛选 */
    chatid?: string
    /** 按用户 ID 筛选 */
    userid?: string
    /** 按消息方向筛选 */
    direction?: 'in' | 'out'
    /** 按消息类型筛选 */
    msgtype?: string
    /** 按关键词搜索 */
    keyword?: string
    /** 返回数量限制，默认 50 */
    limit?: number
    /** 偏移量，用于分页 */
    offset?: number
    /** 开始日期 */
    startDate?: string
    /** 结束日期 */
    endDate?: string
}

/** 数据库实例 */
let db: Database.Database | null = null

/**
 * 初始化数据库
 *
 * 创建数据库连接和消息表，如果表不存在则自动创建。
 * 使用 WAL 模式提高并发性能。
 *
 * @param dbPath - 数据库文件路径
 * @returns 数据库实例
 */
export function initDatabase(dbPath: string): Database.Database {
    if (db) return db

    // 确保目录存在
    const dir = dirname(dbPath)
    mkdirSync(dir, { recursive: true })

    // 创建数据库连接
    db = new Database(dbPath)
    // 启用 WAL 模式
    db.pragma('journal_mode = WAL')

    // 创建消息表
    db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      msgid TEXT UNIQUE,
      platform TEXT NOT NULL,
      chatid TEXT,
      userid TEXT,
      direction TEXT NOT NULL,
      msgtype TEXT NOT NULL,
      content TEXT,
      media_id TEXT,
      media_path TEXT,
      raw TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_platform ON messages(platform);
    CREATE INDEX IF NOT EXISTS idx_messages_chatid ON messages(chatid);
    CREATE INDEX IF NOT EXISTS idx_messages_userid ON messages(userid);
    CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
    CREATE INDEX IF NOT EXISTS idx_messages_msgtype ON messages(msgtype);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  `)

    logger.info(`Database initialized: ${dbPath}`)
    return db
}

/**
 * 获取数据库实例
 *
 * @returns 数据库实例
 * @throws 如果数据库未初始化
 */
export function getDatabase(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase first.')
    }
    return db
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
    if (db) {
        db.close()
        db = null
        logger.info('Database closed')
    }
}

/**
 * 保存消息到数据库
 *
 * @param msg - 消息记录（部分字段）
 * @returns 插入记录的 ID
 */
export function saveMessage(msg: Partial<MessageRecord>): number {
    const database = getDatabase()
    const stmt = database.prepare(`
    INSERT OR IGNORE INTO messages 
    (msgid, platform, chatid, userid, direction, msgtype, content, media_id, media_path, raw)
    VALUES (@msgid, @platform, @chatid, @userid, @direction, @msgtype, @content, @media_id, @media_path, @raw)
  `)
    const result = stmt.run({
        msgid: msg.msgid || null,
        platform: msg.platform,
        chatid: msg.chatid || null,
        userid: msg.userid || null,
        direction: msg.direction,
        msgtype: msg.msgtype,
        content: msg.content || null,
        media_id: msg.media_id || null,
        media_path: msg.media_path || null,
        raw: msg.raw || null
    })
    return result.lastInsertRowid as number
}

/**
 * 查询消息列表
 *
 * 支持多条件筛选和分页。
 *
 * @param query - 查询参数
 * @returns 消息记录列表
 */
export function queryMessages(query: MessageQuery): MessageRecord[] {
    const database = getDatabase()
    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    // 构建查询条件
    if (query.platform) {
        conditions.push('platform = @platform')
        params.platform = query.platform
    }
    if (query.chatid) {
        conditions.push('chatid = @chatid')
        params.chatid = query.chatid
    }
    if (query.userid) {
        conditions.push('userid = @userid')
        params.userid = query.userid
    }
    if (query.direction) {
        conditions.push('direction = @direction')
        params.direction = query.direction
    }
    if (query.msgtype) {
        conditions.push('msgtype = @msgtype')
        params.msgtype = query.msgtype
    }
    if (query.keyword) {
        conditions.push('content LIKE @keyword')
        params.keyword = `%${query.keyword}%`
    }
    if (query.startDate) {
        conditions.push('created_at >= @startDate')
        params.startDate = query.startDate
    }
    if (query.endDate) {
        conditions.push('created_at <= @endDate')
        params.endDate = query.endDate
    }

    // 构建 SQL 语句
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = query.limit || 50
    const offset = query.offset || 0

    const sql = `
    SELECT * FROM messages 
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `

    const stmt = database.prepare(sql)
    return stmt.all({ ...params, limit, offset }) as MessageRecord[]
}

/**
 * 根据 ID 获取单条消息
 *
 * @param id - 消息 ID
 * @returns 消息记录，不存在返回 undefined
 */
export function getMessageById(id: number): MessageRecord | undefined {
    const database = getDatabase()
    const stmt = database.prepare('SELECT * FROM messages WHERE id = ?')
    return stmt.get(id) as MessageRecord | undefined
}

/**
 * 根据 msgid 获取单条消息
 *
 * @param msgid - 平台消息 ID
 * @returns 消息记录，不存在返回 undefined
 */
export function getMessageByMsgid(msgid: string): MessageRecord | undefined {
    const database = getDatabase()
    const stmt = database.prepare('SELECT * FROM messages WHERE msgid = ?')
    return stmt.get(msgid) as MessageRecord | undefined
}

/**
 * 统计消息数量
 *
 * @param query - 查询参数
 * @returns 符合条件的消息数量
 */
export function countMessages(query: MessageQuery): number {
    const database = getDatabase()
    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    // 构建查询条件（与 queryMessages 相同）
    if (query.platform) {
        conditions.push('platform = @platform')
        params.platform = query.platform
    }
    if (query.chatid) {
        conditions.push('chatid = @chatid')
        params.chatid = query.chatid
    }
    if (query.userid) {
        conditions.push('userid = @userid')
        params.userid = query.userid
    }
    if (query.direction) {
        conditions.push('direction = @direction')
        params.direction = query.direction
    }
    if (query.msgtype) {
        conditions.push('msgtype = @msgtype')
        params.msgtype = query.msgtype
    }
    if (query.keyword) {
        conditions.push('content LIKE @keyword')
        params.keyword = `%${query.keyword}%`
    }
    if (query.startDate) {
        conditions.push('created_at >= @startDate')
        params.startDate = query.startDate
    }
    if (query.endDate) {
        conditions.push('created_at <= @endDate')
        params.endDate = query.endDate
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sql = `SELECT COUNT(*) as count FROM messages ${whereClause}`

    const stmt = database.prepare(sql)
    const result = stmt.get(params) as { count: number }
    return result.count
}

/**
 * 删除指定日期之前的消息
 *
 * @param date - 日期字符串
 * @returns 删除的记录数
 */
export function deleteMessagesBefore(date: string): number {
    const database = getDatabase()
    const stmt = database.prepare('DELETE FROM messages WHERE created_at < ?')
    const result = stmt.run(date)
    return result.changes
}

/**
 * 获取消息统计信息
 *
 * @returns 统计信息对象
 */
export function getStats(): {
    total: number
    incoming: number
    outgoing: number
    byType: Record<string, number>
} {
    const database = getDatabase()

    // 总消息数
    const total = (
        database.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }
    ).count

    // 接收消息数
    const incoming = (
        database.prepare("SELECT COUNT(*) as count FROM messages WHERE direction = 'in'").get() as {
            count: number
        }
    ).count

    // 发送消息数
    const outgoing = (
        database
            .prepare("SELECT COUNT(*) as count FROM messages WHERE direction = 'out'")
            .get() as { count: number }
    ).count

    // 按类型统计
    const byTypeRows = database
        .prepare('SELECT msgtype, COUNT(*) as count FROM messages GROUP BY msgtype')
        .all() as Array<{ msgtype: string; count: number }>
    const byType: Record<string, number> = {}
    for (const row of byTypeRows) {
        byType[row.msgtype] = row.count
    }

    return { total, incoming, outgoing, byType }
}
