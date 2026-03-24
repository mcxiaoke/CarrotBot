import { TPLinkRouter, HostInfo } from './lan_devices.js';
import { logger } from '../logger.js';

export interface LanServiceConfig {
  routerIp: string;
  routerPassword: string;
  refreshInterval: number;
}

export class LanService {
  private router: TPLinkRouter;
  private routerIp: string;
  private refreshInterval: number;
  private hostsCache: HostInfo[] = [];
  private lastUpdate = 0;
  private isRefreshing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: LanServiceConfig) {
    this.routerIp = config.routerIp;
    this.router = new TPLinkRouter({
      ip: config.routerIp,
      password: config.routerPassword,
    });
    this.refreshInterval = config.refreshInterval;
  }

  async refreshHosts(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      const hosts = await this.router.getHosts();
      this.hostsCache = hosts;
      this.lastUpdate = Date.now();
      logger.debug(`刷新设备列表: ${hosts.length} 台设备在线`);
    } catch (error) {
      logger.error({ error }, '刷新设备列表失败');
    } finally {
      this.isRefreshing = false;
    }
  }

  async start(): Promise<void> {
    logger.info(`LAN Service 启动，路由器: ${this.routerIp}`);
    await this.refreshHosts();
    this.timer = setInterval(() => this.refreshHosts(), this.refreshInterval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getHosts(): HostInfo[] {
    return this.hostsCache;
  }

  getLastUpdate(): Date {
    return new Date(this.lastUpdate);
  }

  findHost(mac?: string, ip?: string): HostInfo | null {
    for (const host of this.hostsCache) {
      if (mac && host.mac.toUpperCase() === mac.toUpperCase().replace(/:/g, '-')) {
        return host;
      }
      if (ip && host.ip === ip) {
        return host;
      }
    }
    return null;
  }

  getStatus() {
    return {
      uptime: process.uptime(),
      lastUpdate: this.getLastUpdate().toISOString(),
      cacheSize: this.hostsCache.length,
      refreshInterval: this.refreshInterval,
    };
  }
}

let lanServiceInstance: LanService | null = null;

export function getLanService(): LanService | null {
  return lanServiceInstance;
}

export async function initLanService(config: LanServiceConfig): Promise<LanService> {
  if (lanServiceInstance) {
    return lanServiceInstance;
  }
  lanServiceInstance = new LanService(config);
  await lanServiceInstance.start();
  return lanServiceInstance;
}
