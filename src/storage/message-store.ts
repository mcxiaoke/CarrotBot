import type { StandardMessage } from '../core/types.js';
import { initDatabase, saveMessage, queryMessages, getMessageById, getMessageByMsgid, countMessages, deleteMessagesBefore, getStats, closeDatabase, type MessageRecord, type MessageQuery } from './database.js';
import { initCache, downloadMedia, saveBuffer, getCachedFiles, deleteCachedFile, clearCacheBefore, getCacheStats, getCachePath, type CacheConfig, type CachedFile } from './cache.js';
import { logger } from '../logger.js';

export interface MessageStoreConfig {
  dbPath: string;
  cachePath: string;
}

export type WeComDownloadFn = (url: string, aesKey: string) => Promise<{ buffer: Buffer; filename?: string }>;
export type TelegramDownloadFn = (fileId: string) => Promise<{ buffer: Buffer; filename?: string }>;

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
  downloadMediaFn?: WeComDownloadFn | TelegramDownloadFn
): Promise<number> {
  let mediaPath: string | null = null;
  const raw = msg.raw as Record<string, unknown>;
  const body = raw?.body as Record<string, unknown> || {};
  const msgid = body.msgid as string | undefined || (raw as { message_id?: number })?.message_id?.toString();

  logger.debug({
    platform: msg.platform,
    msgType: msg.msgType,
    mediaUrl: msg.mediaUrl,
    aesKey: msg.aesKey,
    hasDownloadFn: !!downloadMediaFn
  }, 'saveIncomingMessage called');

  if (msg.msgType !== 'text' && msg.msgType !== 'event' && msg.mediaUrl) {
    try {
      const type = msg.msgType as 'image' | 'voice' | 'video' | 'file';

      if (msg.platform === 'telegram') {
        logger.debug({ fileId: msg.mediaUrl }, 'Downloading Telegram media');
        if (downloadMediaFn) {
          const { buffer, filename } = await (downloadMediaFn as TelegramDownloadFn)(msg.mediaUrl);
          const ext = filename?.split('.').pop();
          const result = await saveBuffer(buffer, type, ext, msg.platform);
          mediaPath = result.path;
        }
      } else if (msg.platform === 'wecom' && msg.aesKey) {
        logger.debug({ url: msg.mediaUrl, hasAesKey: !!msg.aesKey }, 'Downloading WeCom media');
        if (downloadMediaFn) {
          const { buffer, filename } = await (downloadMediaFn as WeComDownloadFn)(msg.mediaUrl, msg.aesKey);
          const ext = filename?.split('.').pop();
          const result = await saveBuffer(buffer, type, ext, msg.platform);
          mediaPath = result.path;
        } else {
          const result = await downloadMedia(msg.mediaUrl, type, msg.aesKey, msg.platform);
          mediaPath = result.path;
        }
      } else {
        logger.debug({ platform: msg.platform, msgType: msg.msgType }, 'Media download skipped: unsupported platform or missing keys');
      }

      if (mediaPath) {
        logger.info({ platform: msg.platform, msgType: msg.msgType, mediaPath }, 'Media downloaded successfully');
      }
    } catch (error) {
      logger.error({ error, msgid, platform: msg.platform, msgType: msg.msgType }, 'Failed to download media for incoming message');
    }
  }

  const chatid = body.chatid as string || (raw as { chat?: { id?: number } })?.chat?.id?.toString();
  const userid = (body.from as Record<string, unknown>)?.userid as string || (raw as { from?: { id?: number } })?.from?.id?.toString();

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
    raw: JSON.stringify(raw),
  });

  logger.debug({ id, msgid, msgtype: msg.msgType, platform: msg.platform, mediaPath }, 'Saved incoming message');
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
