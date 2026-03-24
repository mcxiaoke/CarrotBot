/**
 * 推送任务服务模块
 * 
 * 本模块实现定时推送任务管理，支持创建、启用、禁用、执行和删除推送任务。
 * 任务可以按指定的时间间隔定期向指定平台发送消息。
 */

import type { IAdapter } from '../core/types.js';
import { logger } from '../logger.js';

/**
 * 推送任务接口
 * 
 * 定义推送任务的基本属性
 */
export interface PushJob {
  /** 任务唯一标识 */
  id: string;
  /** 目标平台：wecom 或 telegram */
  platform: string;
  /** 目标会话 ID */
  target: string;
  /** 推送内容 */
  content: string;
  /** 调度表达式，格式：every_Xs|Xm|Xh|Xd，如 every_1h 表示每小时执行一次 */
  schedule: string;
  /** 是否启用 */
  enabled: boolean;
  /** 上次执行时间 */
  lastRun?: string;
  /** 下次执行时间 */
  nextRun?: string;
}

/**
 * 内部推送任务接口
 * 
 * 扩展 PushJob，包含适配器引用和定时器
 */
interface InternalPushJob extends PushJob {
  /** 关联的平台适配器 */
  adapter: IAdapter;
  /** 定时器句柄 */
  timer?: NodeJS.Timeout;
}

/**
 * 推送服务实现类
 * 
 * 管理推送任务的生命周期，包括：
 * - 添加和删除任务
 * - 启用和禁用任务
 * - 执行任务
 * - 定时调度
 * 
 * @example
 * ```typescript
 * pushService.addJob({
 *   id: 'daily-reminder',
 *   platform: 'wecom',
 *   target: 'chat-id',
 *   content: '每日提醒内容',
 *   schedule: 'every_24h',
 *   enabled: true
 * }, wecomAdapter);
 * ```
 */
class PushServiceImpl {
  /** 任务映射表 */
  private jobs: Map<string, InternalPushJob> = new Map();

  /**
   * 添加推送任务
   * 
   * @param job - 任务配置
   * @param adapter - 平台适配器
   */
  addJob(job: PushJob, adapter: IAdapter): void {
    const internalJob: InternalPushJob = {
      ...job,
      adapter,
    };

    this.jobs.set(job.id, internalJob);

    // 如果任务启用，立即开始调度
    if (job.enabled) {
      this.scheduleJob(internalJob);
    }

    logger.info({ jobId: job.id, platform: job.platform, target: job.target }, 'Push job added');
  }

  /**
   * 删除推送任务
   * 
   * @param id - 任务 ID
   * @returns 是否删除成功
   */
  removeJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      // 清除定时器
      if (job.timer) {
        clearInterval(job.timer);
      }
      this.jobs.delete(id);
      logger.info({ jobId: id }, 'Push job removed');
      return true;
    }
    return false;
  }

  /**
   * 启用推送任务
   * 
   * @param id - 任务 ID
   * @returns 是否启用成功
   */
  enableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = true;
      this.scheduleJob(job);
      logger.info({ jobId: id }, 'Push job enabled');
      return true;
    }
    return false;
  }

  /**
   * 禁用推送任务
   * 
   * @param id - 任务 ID
   * @returns 是否禁用成功
   */
  disableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = false;
      // 清除定时器
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = undefined;
      }
      logger.info({ jobId: id }, 'Push job disabled');
      return true;
    }
    return false;
  }

  /**
   * 获取所有任务列表
   * @returns 任务列表（不包含内部属性）
   */
  getJobs(): PushJob[] {
    return Array.from(this.jobs.values()).map((job) => ({
      id: job.id,
      platform: job.platform,
      target: job.target,
      content: job.content,
      schedule: job.schedule,
      enabled: job.enabled,
      lastRun: job.lastRun,
      nextRun: job.nextRun,
    }));
  }

  /**
   * 获取单个任务详情
   * @param id - 任务 ID
   * @returns 任务详情，不存在返回 undefined
   */
  getJob(id: string): PushJob | undefined {
    const job = this.jobs.get(id);
    if (job) {
      return {
        id: job.id,
        platform: job.platform,
        target: job.target,
        content: job.content,
        schedule: job.schedule,
        enabled: job.enabled,
        lastRun: job.lastRun,
        nextRun: job.nextRun,
      };
    }
    return undefined;
  }

  /**
   * 立即执行任务
   * 
   * @param id - 任务 ID
   * @returns 是否执行成功
   */
  async executeJob(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) {
      return false;
    }

    try {
      // 构造消息对象并发送
      await job.adapter.sendMessage(
        {
          platform: job.platform,
          from: job.target,
          content: '',
          msgType: 'text',
          raw: null,
        },
        job.content
      );
      job.lastRun = new Date().toISOString();
      logger.info({ jobId: id }, 'Push job executed');
      return true;
    } catch (err) {
      logger.error({ err, jobId: id }, 'Push job failed');
      return false;
    }
  }

  /**
   * 调度任务执行
   * 
   * 解析调度表达式并设置定时器。
   * 
   * @param job - 内部任务对象
   */
  private scheduleJob(job: InternalPushJob): void {
    // 清除现有定时器
    if (job.timer) {
      clearInterval(job.timer);
    }

    // 解析调度表达式
    const interval = this.parseSchedule(job.schedule);
    if (interval === null) {
      logger.warn({ jobId: job.id, schedule: job.schedule }, 'Invalid schedule format');
      return;
    }

    // 计算下次执行时间
    job.nextRun = new Date(Date.now() + interval).toISOString();

    // 设置定时器
    job.timer = setInterval(async () => {
      if (!job.enabled) return;

      try {
        await job.adapter.sendMessage(
          {
            platform: job.platform,
            from: job.target,
            content: '',
            msgType: 'text',
            raw: null,
          },
          job.content
        );
        job.lastRun = new Date().toISOString();
        job.nextRun = new Date(Date.now() + interval).toISOString();
        logger.info({ jobId: job.id }, 'Push job executed');
      } catch (err) {
        logger.error({ err, jobId: job.id }, 'Push job failed');
      }
    }, interval);

    logger.debug({ jobId: job.id, intervalMs: interval }, 'Push job scheduled');
  }

  /**
   * 解析调度表达式
   * 
   * 支持格式：every_Xs|Xm|Xh|Xd
   * - s: 秒
   * - m: 分钟
   * - h: 小时
   * - d: 天
   * 
   * @param schedule - 调度表达式
   * @returns 间隔毫秒数，无效格式返回 null
   */
  private parseSchedule(schedule: string): number | null {
    const match = schedule.match(/^every_(\d+)(s|m|h|d)$/);
    if (!match) {
      return null;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    // 根据单位计算毫秒数
    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return null;
    }
  }

  /**
   * 停止所有任务
   * 
   * 清除所有定时器，用于服务关闭时调用。
   */
  stop(): void {
    for (const job of this.jobs.values()) {
      if (job.timer) {
        clearInterval(job.timer);
      }
    }
    logger.info('Push service stopped');
  }
}

/** 推送服务单例实例 */
export const pushService = new PushServiceImpl();
