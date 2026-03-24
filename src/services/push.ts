import type { IAdapter } from '../core/types.js';
import { logger } from '../logger.js';

export interface PushJob {
  id: string;
  platform: string;
  target: string;
  content: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

interface InternalPushJob extends PushJob {
  adapter: IAdapter;
  timer?: NodeJS.Timeout;
}

class PushServiceImpl {
  private jobs: Map<string, InternalPushJob> = new Map();

  addJob(job: PushJob, adapter: IAdapter): void {
    const internalJob: InternalPushJob = {
      ...job,
      adapter,
    };

    this.jobs.set(job.id, internalJob);

    if (job.enabled) {
      this.scheduleJob(internalJob);
    }

    logger.info({ jobId: job.id, platform: job.platform, target: job.target }, 'Push job added');
  }

  removeJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      if (job.timer) {
        clearInterval(job.timer);
      }
      this.jobs.delete(id);
      logger.info({ jobId: id }, 'Push job removed');
      return true;
    }
    return false;
  }

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

  disableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = false;
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = undefined;
      }
      logger.info({ jobId: id }, 'Push job disabled');
      return true;
    }
    return false;
  }

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

  async executeJob(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) {
      return false;
    }

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
      logger.info({ jobId: id }, 'Push job executed');
      return true;
    } catch (err) {
      logger.error({ err, jobId: id }, 'Push job failed');
      return false;
    }
  }

  private scheduleJob(job: InternalPushJob): void {
    if (job.timer) {
      clearInterval(job.timer);
    }

    const interval = this.parseSchedule(job.schedule);
    if (interval === null) {
      logger.warn({ jobId: job.id, schedule: job.schedule }, 'Invalid schedule format');
      return;
    }

    job.nextRun = new Date(Date.now() + interval).toISOString();

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

  private parseSchedule(schedule: string): number | null {
    const match = schedule.match(/^every_(\d+)(s|m|h|d)$/);
    if (!match) {
      return null;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

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

  stop(): void {
    for (const job of this.jobs.values()) {
      if (job.timer) {
        clearInterval(job.timer);
      }
    }
    logger.info('Push service stopped');
  }
}

export const pushService = new PushServiceImpl();
