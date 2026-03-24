import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../logger.js';

export interface MessageRecord {
  id: number;
  msgid: string | null;
  platform: string;
  chatid: string | null;
  userid: string | null;
  direction: 'in' | 'out';
  msgtype: string;
  content: string | null;
  media_id: string | null;
  media_path: string | null;
  raw: string | null;
  created_at: string;
}

export interface MessageQuery {
  platform?: string;
  chatid?: string;
  userid?: string;
  direction?: 'in' | 'out';
  msgtype?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

let db: Database.Database | null = null;

export function initDatabase(dbPath: string): Database.Database {
  if (db) return db;

  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

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
  `);

  logger.info(`Database initialized: ${dbPath}`);
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database closed');
  }
}

export function saveMessage(msg: Partial<MessageRecord>): number {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO messages 
    (msgid, platform, chatid, userid, direction, msgtype, content, media_id, media_path, raw)
    VALUES (@msgid, @platform, @chatid, @userid, @direction, @msgtype, @content, @media_id, @media_path, @raw)
  `);
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
    raw: msg.raw || null,
  });
  return result.lastInsertRowid as number;
}

export function queryMessages(query: MessageQuery): MessageRecord[] {
  const database = getDatabase();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (query.platform) {
    conditions.push('platform = @platform');
    params.platform = query.platform;
  }
  if (query.chatid) {
    conditions.push('chatid = @chatid');
    params.chatid = query.chatid;
  }
  if (query.userid) {
    conditions.push('userid = @userid');
    params.userid = query.userid;
  }
  if (query.direction) {
    conditions.push('direction = @direction');
    params.direction = query.direction;
  }
  if (query.msgtype) {
    conditions.push('msgtype = @msgtype');
    params.msgtype = query.msgtype;
  }
  if (query.keyword) {
    conditions.push('content LIKE @keyword');
    params.keyword = `%${query.keyword}%`;
  }
  if (query.startDate) {
    conditions.push('created_at >= @startDate');
    params.startDate = query.startDate;
  }
  if (query.endDate) {
    conditions.push('created_at <= @endDate');
    params.endDate = query.endDate;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = query.limit || 50;
  const offset = query.offset || 0;

  const sql = `
    SELECT * FROM messages 
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `;

  const stmt = database.prepare(sql);
  return stmt.all({ ...params, limit, offset }) as MessageRecord[];
}

export function getMessageById(id: number): MessageRecord | undefined {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM messages WHERE id = ?');
  return stmt.get(id) as MessageRecord | undefined;
}

export function getMessageByMsgid(msgid: string): MessageRecord | undefined {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM messages WHERE msgid = ?');
  return stmt.get(msgid) as MessageRecord | undefined;
}

export function countMessages(query: MessageQuery): number {
  const database = getDatabase();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (query.platform) {
    conditions.push('platform = @platform');
    params.platform = query.platform;
  }
  if (query.chatid) {
    conditions.push('chatid = @chatid');
    params.chatid = query.chatid;
  }
  if (query.userid) {
    conditions.push('userid = @userid');
    params.userid = query.userid;
  }
  if (query.direction) {
    conditions.push('direction = @direction');
    params.direction = query.direction;
  }
  if (query.msgtype) {
    conditions.push('msgtype = @msgtype');
    params.msgtype = query.msgtype;
  }
  if (query.keyword) {
    conditions.push('content LIKE @keyword');
    params.keyword = `%${query.keyword}%`;
  }
  if (query.startDate) {
    conditions.push('created_at >= @startDate');
    params.startDate = query.startDate;
  }
  if (query.endDate) {
    conditions.push('created_at <= @endDate');
    params.endDate = query.endDate;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT COUNT(*) as count FROM messages ${whereClause}`;

  const stmt = database.prepare(sql);
  const result = stmt.get(params) as { count: number };
  return result.count;
}

export function deleteMessagesBefore(date: string): number {
  const database = getDatabase();
  const stmt = database.prepare('DELETE FROM messages WHERE created_at < ?');
  const result = stmt.run(date);
  return result.changes;
}

export function getStats(): {
  total: number;
  incoming: number;
  outgoing: number;
  byType: Record<string, number>;
} {
  const database = getDatabase();
  const total = (database.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count;
  const incoming = (database.prepare("SELECT COUNT(*) as count FROM messages WHERE direction = 'in'").get() as { count: number }).count;
  const outgoing = (database.prepare("SELECT COUNT(*) as count FROM messages WHERE direction = 'out'").get() as { count: number }).count;
  
  const byTypeRows = database.prepare('SELECT msgtype, COUNT(*) as count FROM messages GROUP BY msgtype').all() as Array<{ msgtype: string; count: number }>;
  const byType: Record<string, number> = {};
  for (const row of byTypeRows) {
    byType[row.msgtype] = row.count;
  }

  return { total, incoming, outgoing, byType };
}
