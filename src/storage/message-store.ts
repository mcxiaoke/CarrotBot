import type { StandardMessage } from '../core/types.js';
import { initDatabase, saveMessage, queryMessages, getMessageById, getMessageByMsgid, countMessages, deleteMessagesBefore, getStats, closeDatabase, type MessageRecord, type MessageQuery } from './database.js';
import { initCache, downloadMedia, saveBuffer, getCachedFiles, deleteCachedFile, clearCacheBefore, getCacheStats, getCachePath, type CacheConfig, type CachedFile } from './cache.js';
import { logger } from '../logger.js';

export interface MessageStoreConfig {
  dbPath: string;
  cachePath: string;
}

let initialized = false;

export function initMessageStore(config: MessageStoreConfig): void {
  if (initialized) return;

  initDatabase(config.dbPath);
  initCache({ cachePath: config.cachePath });
  initialized = true;
  logger.info('MessageStore initialized');
}

export function closeMessageStore(): void {
  closeDatabase();
  initialized = false;
}

export async function saveIncomingMessage(
  msg: StandardMessage,
  downloadMediaFn?: (url: string, aesKey: string) => Promise<{ buffer: Buffer; filename?: string }>
): Promise<number> {
  let mediaPath: string | null = null;
  const raw = msg.raw as Record<string, unknown>;
  const body = raw?.body as Record<string, unknown> || {};
  const msgid = body.msgid as string | undefined;

  if (msg.msgType !== 'text' && msg.msgType !== 'event' && msg.mediaUrl && msg.aesKey) {
    try {
      if (downloadMediaFn) {
        const { buffer, filename } = await downloadMediaFn(msg.mediaUrl, msg.aesKey);
        const type = msg.msgType as 'image' | 'voice' | 'video' | 'file';
        const ext = filename?.split('.').pop();
        const result = await saveBuffer(buffer, type, ext);
        mediaPath = result.path;
      } else {
        const type = msg.msgType as 'image' | 'voice' | 'video' | 'file';
        const result = await downloadMedia(msg.mediaUrl, type, msg.aesKey);
        mediaPath = result.path;
      }
    } catch (error) {
      logger.error({ error, msgid }, 'Failed to download media for incoming message');
    }
  }

  const id = saveMessage({
    msgid: msgid || undefined,
    platform: msg.platform,
    chatid: body.chatid as string,
    userid: (body.from as Record<string, unknown>)?.userid as string,
    direction: 'in',
    msgtype: msg.msgType,
    content: msg.msgType === 'text' ? msg.content : null,
    media_id: msg.mediaKey || null,
    media_path: mediaPath,
    raw: JSON.stringify(raw),
  });

  logger.debug({ id, msgid, msgtype: msg.msgType }, 'Saved incoming message');
  return id;
}

export async function saveOutgoingMessage(
  msg: StandardMessage,
  msgtype: string,
  content: string | null,
  mediaId?: string,
  mediaPath?: string
): Promise<number> {
  const raw = msg.raw as Record<string, unknown>;
  const body = raw?.body as Record<string, unknown> || {};

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
    raw: null,
  });

  logger.debug({ id, msgtype, direction: 'out' }, 'Saved outgoing message');
  return id;
}

export { queryMessages, getMessageById, getMessageByMsgid, countMessages, getStats };
export { getCachedFiles, deleteCachedFile, clearCacheBefore, getCacheStats, getCachePath };
export type { MessageRecord, MessageQuery, CachedFile };
