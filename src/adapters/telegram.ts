/**
 * Telegram 适配器模块
 * 
 * 本模块实现了 Telegram Bot 的适配器，通过 Telegram Bot API 进行消息收发。
 * 支持代理连接，适合需要翻墙访问 Telegram API 的场景。
 * 
 * 主要功能：
 * - 长轮询方式获取消息
 * - 消息解析和转换
 * - 文本、Markdown、图片、文档等消息发送
 * - 媒体文件下载
 * - HTTP/SOCKS5 代理支持
 */

import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import type { Agent } from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { IAdapter, StandardMessage, MessageType } from '../core/types.js';
import { saveIncomingMessage, saveOutgoingMessage, type TelegramDownloadFn } from '../storage/message-store.js';
import { logger } from '../logger.js';

/**
 * Telegram 适配器配置接口
 */
export interface TelegramConfig {
  /** Bot Token，从 BotFather 获取 */
  token: string;
  /** 代理配置（可选） */
  proxy?: {
    /** 代理类型：http 或 socks */
    type: 'http' | 'socks';
    /** 代理服务器地址 */
    host: string;
    /** 代理服务器端口 */
    port: number;
  };
}

/** 文件下载最大重试次数 */
const MAX_RETRIES = 3;
/** 重试延迟时间（毫秒） */
const RETRY_DELAY = 2000;

/**
 * Telegram 适配器类
 * 
 * 实现了 IAdapter 接口，提供 Telegram 平台的消息收发能力。
 * 使用 node-telegram-bot-api 进行 API 调用。
 * 
 * @example
 * ```typescript
 * const adapter = new TelegramAdapter({
 *   token: 'your-bot-token',
 *   proxy: { type: 'http', host: '127.0.0.1', port: 7890 }
 * });
 * 
 * adapter.setMessageHandler((msg) => {
 *   // 处理收到的消息
 * });
 * 
 * adapter.connect();
 * ```
 */
export class TelegramAdapter implements IAdapter {
  /** 平台标识 */
  readonly platform = 'telegram';
  
  /** Telegram Bot 实例 */
  private bot: TelegramBot;
  
  /** Bot Token */
  private token: string;
  
  /** 代理 Agent（用于文件下载） */
  private proxyAgent: Agent | undefined;
  
  /** 消息处理回调函数 */
  private onMessage: ((msg: StandardMessage) => void) | null = null;

  /**
   * 创建 Telegram 适配器实例
   * @param config - 适配器配置
   */
  constructor(config: TelegramConfig) {
    this.token = config.token;
    const options: TelegramBot.ConstructorOptions = {
      polling: {
        interval: 500,        // 轮询间隔（毫秒）
        autoStart: false,     // 不自动开始轮询
        params: {
          timeout: 10,        // 长轮询超时时间（秒）
          allowed_updates: ['message', 'channel_post', 'callback_query'],
        },
      },
    };

    // 配置代理（如果提供）
    if (config.proxy) {
      const { type, host, port } = config.proxy;
      const proxyUrl = type === 'socks'
        ? `socks5://${host}:${port}`
        : `http://${host}:${port}`;
      
      options.request = {
        proxy: proxyUrl,
      } as any;

      // 创建代理 Agent 用于文件下载
      this.proxyAgent = type === 'socks'
        ? new SocksProxyAgent(proxyUrl)
        : new HttpsProxyAgent(proxyUrl);
      
      logger.info({ type, host, port, proxyUrl }, 'Telegram bot using proxy');
    }

    this.bot = new TelegramBot(config.token, options);
  }

  /**
   * 解析 Telegram 原始消息为标准格式
   * 
   * 将 Telegram 的 Message 对象转换为系统内部统一的消息格式。
   * 支持文本、图片、语音、视频、文件、贴纸等多种消息类型。
   * 
   * @param raw - 原始 Telegram Message 对象
   * @returns 标准化的消息对象
   */
  parseMessage(raw: unknown): StandardMessage {
    const msg = raw as TelegramBot.Message;
    let content = '';
    let msgType: MessageType = 'text';
    let mediaUrl: string | undefined;
    let mediaKey: string | undefined;

    // 根据消息类型解析不同的消息内容
    if (msg.text) {
      // 文本消息
      content = msg.text;
      msgType = 'text';
    } else if (msg.photo) {
      // 图片消息（Telegram 会返回多个尺寸的图片，取最大的）
      content = '[图片]';
      msgType = 'image';
      const largestPhoto = msg.photo[msg.photo.length - 1];
      mediaUrl = largestPhoto?.file_id;
      logger.debug({ fileId: mediaUrl, photoSize: largestPhoto?.file_size }, 'Parsed Telegram photo');
    } else if (msg.voice) {
      // 语音消息
      content = '[语音]';
      msgType = 'voice';
      mediaUrl = msg.voice.file_id;
      logger.debug({ fileId: mediaUrl }, 'Parsed Telegram voice');
    } else if (msg.video) {
      // 视频消息
      content = '[视频]';
      msgType = 'video';
      mediaUrl = msg.video.file_id;
      logger.debug({ fileId: mediaUrl }, 'Parsed Telegram video');
    } else if (msg.document) {
      // 文件消息
      content = `[文件] ${msg.document.file_name || ''}`;
      msgType = 'file';
      mediaUrl = msg.document.file_id;
      logger.debug({ fileId: mediaUrl, fileName: msg.document.file_name }, 'Parsed Telegram document');
    } else if (msg.sticker) {
      // 贴纸消息
      content = '[贴纸]';
      msgType = 'image';
      mediaUrl = msg.sticker.file_id;
      logger.debug({ fileId: mediaUrl }, 'Parsed Telegram sticker');
    } else {
      // 未知消息类型
      content = '[未知消息]';
      msgType = 'text';
    }

    // 获取发送者标识（使用 chat.id）
    const from = msg.chat?.id?.toString() || '';

    return {
      platform: this.platform,
      from,
      content: content.trim(),
      msgType,
      raw,
      mediaUrl,
      mediaKey,
    };
  }

  /**
   * 下载媒体文件
   * 
   * 从 Telegram 服务器下载媒体文件，支持重试机制。
   * 
   * @param fileId - Telegram 文件 ID
   * @returns 文件二进制数据和文件名
   */
  async downloadFile(fileId: string): Promise<{ buffer: Buffer; filename?: string }> {
    logger.debug({ fileId }, 'Getting file info from Telegram');
    const file = await this.bot.getFile(fileId);
    
    if (!file.file_path) {
      throw new Error('File path not found in Telegram response');
    }

    // 构建文件下载 URL
    const fileUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
    const filename = file.file_path.split('/').pop();

    let lastError: Error | null = null;
    
    // 重试下载
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.debug({ fileId, fileUrl, fileSize: file.file_size, attempt }, 'Downloading Telegram file');

        const response = await axios.get(fileUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          httpsAgent: this.proxyAgent,
        });

        const buffer = Buffer.from(response.data);

        logger.debug({ fileId, filename, size: buffer.length, attempt }, 'Telegram file downloaded');
        return { buffer, filename };
      } catch (err) {
        lastError = err as Error;
        logger.warn({ fileId, attempt, maxRetries: MAX_RETRIES, err: lastError.message }, 'Download attempt failed');
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        }
      }
    }

    logger.error({ err: lastError, fileId }, 'Failed to download Telegram file after all retries');
    throw lastError;
  }

  /**
   * 发送文本消息
   * @param msg - 原始消息对象
   * @param content - 消息内容
   */
  async sendMessage(msg: StandardMessage, content: string): Promise<void> {
    try {
      const chatId = parseInt(msg.from, 10);
      await this.bot.sendMessage(chatId, content);
      await saveOutgoingMessage(msg, 'text', content);
      logger.debug({ to: msg.from, content }, 'Telegram message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send Telegram message');
      throw err;
    }
  }

  /**
   * 发送纯文本消息（与 sendMessage 相同）
   * @param msg - 原始消息对象
   * @param content - 文本内容
   */
  async sendText(msg: StandardMessage, content: string): Promise<void> {
    return this.sendMessage(msg, content);
  }

  /**
   * 发送 Markdown 格式消息
   * 
   * 使用 Telegram MarkdownV2 格式解析模式。
   * 
   * @param msg - 原始消息对象
   * @param content - Markdown 格式内容
   */
  async sendMarkdown(msg: StandardMessage, content: string): Promise<void> {
    try {
      const chatId = parseInt(msg.from, 10);
      await this.bot.sendMessage(chatId, content, { parse_mode: 'MarkdownV2' });
      await saveOutgoingMessage(msg, 'markdown', content);
      logger.debug({ to: msg.from, content }, 'Telegram markdown message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send Telegram markdown message');
      throw err;
    }
  }

  /**
   * 发送图片消息
   * @param msg - 原始消息对象
   * @param fileId - 文件 ID 或 URL
   * @param caption - 图片说明（可选）
   */
  async sendImage(msg: StandardMessage, fileId: string, caption?: string): Promise<void> {
    try {
      const chatId = parseInt(msg.from, 10);
      await this.bot.sendPhoto(chatId, fileId, { caption });
      await saveOutgoingMessage(msg, 'image', caption || null, fileId);
      logger.debug({ to: msg.from, fileId }, 'Telegram image sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send Telegram image');
      throw err;
    }
  }

  /**
   * 发送文档消息
   * @param msg - 原始消息对象
   * @param fileId - 文件 ID 或 URL
   * @param caption - 文件说明（可选）
   */
  async sendDocument(msg: StandardMessage, fileId: string, caption?: string): Promise<void> {
    try {
      const chatId = parseInt(msg.from, 10);
      await this.bot.sendDocument(chatId, fileId, { caption });
      await saveOutgoingMessage(msg, 'file', caption || null, fileId);
      logger.debug({ to: msg.from, fileId }, 'Telegram document sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send Telegram document');
      throw err;
    }
  }

  /**
   * 设置消息处理回调
   * @param handler - 消息处理函数
   */
  setMessageHandler(handler: (msg: StandardMessage) => void): void {
    this.onMessage = handler;
  }

  /**
   * 连接到 Telegram 服务器
   * 
   * 开始长轮询获取消息，并注册事件监听器。
   */
  connect(): void {
    // 监听消息事件
    this.bot.on('message', async (msg) => {
      const standardMsg = this.parseMessage(msg);

      // 保存收到的消息到数据库
      try {
        await saveIncomingMessage(standardMsg, (fileId: string) => this.downloadFile(fileId));
        logger.info({ msgtype: standardMsg.msgType, from: standardMsg.from, hasMedia: !!standardMsg.mediaUrl }, 'Telegram message saved');
      } catch (err) {
        logger.error({ err, msgtype: standardMsg.msgType, from: standardMsg.from }, 'Failed to save Telegram message');
      }

      // 调用消息处理回调
      if (this.onMessage) {
        this.onMessage(standardMsg);
      }
    });

    // 监听错误事件
    this.bot.on('error', (err) => {
      logger.error({ err }, 'Telegram bot error');
    });

    // 监听轮询错误事件
    this.bot.on('polling_error', (err) => {
      logger.error({ err: err.message }, 'Telegram polling error');
    });

    // 开始轮询
    this.bot.startPolling();
    logger.info('Telegram bot started');
  }

  /**
   * 断开与 Telegram 服务器的连接
   */
  disconnect(): void {
    this.bot.stopPolling();
    logger.info('Telegram bot stopped');
  }

  /**
   * 获取底层 TelegramBot 实例
   * 
   * 用于直接调用 Telegram Bot API 的其他方法。
   * 
   * @returns TelegramBot 实例
   */
  getBot(): TelegramBot {
    return this.bot;
  }
}
