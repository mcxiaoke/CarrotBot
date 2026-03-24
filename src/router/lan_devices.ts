import axios from 'axios';

const STR_B = 'RDpbLfCPsJZ7fiv';
const STR_C =
  'yLwVl0zKqws7LgKPRQ84Mdt708T1qQ3Ha7xv3H7NyU84p21BriUWBU43odz3iP4rBL3cD02KZciXTysVXiV8ngg6vL48rPJyAUw0HurW20xqxv9aYb4M9wK1Ae0wlro510qXeU07kV57fQMc8L6aLgMLwygtc0F10a0Dg70TOoouyFhdysuRMO51yY5ZlOZZLEal1h0t9YQW0Ko7oBwmCAHoic4HYbUyVeU3sfQ1xtXcPcf1aT303wAQhv66qzW';

const WIFI_MODE_MAP: Record<number, string> = { 0: '有线', 1: '无线' };
const PHY_MODE_MAP: Record<number, string> = { 0: '未知', 4: '2.4G', 5: '5G', 6: 'WiFi6' };

function formatSpeed(speed: number): string {
  if (speed < 1024) return `${speed} B/s`;
  if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(1)} KB/s`;
  return `${(speed / 1024 / 1024).toFixed(2)} MB/s`;
}

function formatConnectTime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分钟`;
  return `${Math.floor(seconds / 86400)}天${Math.floor((seconds % 86400) / 3600)}小时`;
}

export interface HostInfoData {
  mac: string;
  ip: string;
  hostname: string;
  ipv6: string;
  upSpeed: number;
  downSpeed: number;
  connectTime: number;
  wifiMode: number;
  phyMode: number;
  isCurHost: boolean;
  blocked: boolean;
}

export class HostInfo {
  mac: string;
  ip: string;
  hostname: string;
  ipv6: string;
  upSpeed: number;
  downSpeed: number;
  connectTime: number;
  wifiMode: number;
  phyMode: number;
  isCurHost: boolean;
  blocked: boolean;

  constructor(data: Partial<HostInfoData> = {}) {
    this.mac = data.mac ?? '';
    this.ip = data.ip ?? '';
    this.hostname = data.hostname ?? '';
    this.ipv6 = data.ipv6 ?? '';
    this.upSpeed = data.upSpeed ?? 0;
    this.downSpeed = data.downSpeed ?? 0;
    this.connectTime = data.connectTime ?? 0;
    this.wifiMode = data.wifiMode ?? 0;
    this.phyMode = data.phyMode ?? 0;
    this.isCurHost = data.isCurHost ?? false;
    this.blocked = data.blocked ?? false;
  }

  get wifiType(): string {
    return WIFI_MODE_MAP[this.wifiMode] ?? '未知';
  }

  get phyType(): string {
    return PHY_MODE_MAP[this.phyMode] ?? '未知';
  }

  get hostnameDecoded(): string {
    return this.hostname ? decodeURIComponent(this.hostname) : '未知设备';
  }

  get connectTimeStr(): string {
    return formatConnectTime(this.connectTime);
  }

  get upSpeedStr(): string {
    return formatSpeed(this.upSpeed);
  }

  get downSpeedStr(): string {
    return formatSpeed(this.downSpeed);
  }

  static fromApiData(data: Record<string, string>): HostInfo {
    return new HostInfo({
      mac: data.mac ?? '',
      ip: data.ip ?? '',
      hostname: data.hostname ?? '',
      ipv6: data.ipv6 ?? '',
      upSpeed: parseInt(data.up_speed ?? '0', 10),
      downSpeed: parseInt(data.down_speed ?? '0', 10),
      connectTime: parseInt(data.connect_time ?? '0', 10),
      wifiMode: parseInt(data.wifi_mode ?? '0', 10),
      phyMode: parseInt(data.phy_mode ?? '0', 10),
      isCurHost: data.is_cur_host === '1',
      blocked: data.blocked === '1',
    });
  }

  toJSON() {
    return {
      mac: this.mac,
      ip: this.ip,
      hostname: this.hostnameDecoded,
      ipv6: this.ipv6,
      upSpeed: this.upSpeed,
      downSpeed: this.downSpeed,
      upSpeedStr: this.upSpeedStr,
      downSpeedStr: this.downSpeedStr,
      connectTime: this.connectTime,
      connectTimeStr: this.connectTimeStr,
      wifiMode: this.wifiMode,
      wifiType: this.wifiType,
      phyMode: this.phyMode,
      phyType: this.phyType,
      isCurHost: this.isCurHost,
      blocked: this.blocked,
    };
  }
}

export interface TPLinkRouterOptions {
  ip: string;
  password: string;
}

export class TPLinkRouter {
  private ip: string;
  private password: string;
  private stok: string | null = null;

  constructor(options: TPLinkRouterOptions) {
    this.ip = options.ip;
    this.password = options.password;
  }

  private securityEncode(password: string): string {
    let result = '';
    const pwdLen = password.length;
    const bLen = STR_B.length;
    const cLen = STR_C.length;
    const maxLen = Math.max(pwdLen, bLen);

    for (let i = 0; i < maxLen; i++) {
      const k = i < pwdLen ? password.charCodeAt(i) : 187;
      const l = i < bLen ? STR_B.charCodeAt(i) : 187;
      result += STR_C[(k ^ l) % cLen];
    }
    return result;
  }

  async login(): Promise<boolean> {
    const url = `http://${this.ip}/`;
    const payload = {
      method: 'do',
      login: { password: this.securityEncode(this.password) },
    };

    try {
      const response = await axios.post(url, payload, { timeout: 5000 });
      const data = response.data;
      if (data.error_code === 0) {
        this.stok = data.stok;
        return true;
      }
      console.log(`登录失败: ${JSON.stringify(data)}`);
    } catch (error) {
      console.log(`登录异常: ${(error as Error).message}`);
    }
    return false;
  }

  private async ensureLogin(): Promise<boolean> {
    if (!this.stok) {
      return await this.login();
    }
    return true;
  }

  private async request(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    if (!(await this.ensureLogin())) {
      return null;
    }

    const url = `http://${this.ip}/stok=${this.stok}/ds`;
    try {
      const response = await axios.post(url, payload, { timeout: 5000 });
      const data = response.data;
      if ('error_code' in data && data.error_code !== 0) {
        this.stok = null;
        return null;
      }
      return data;
    } catch (error) {
      console.log(`请求异常: ${(error as Error).message}`);
      this.stok = null;
      return null;
    }
  }

  async getHosts(): Promise<HostInfo[]> {
    const payload = {
      system: { name: ['sys'] },
      hosts_info: { table: 'host_info' },
      network: { name: 'iface_mac' },
      function: { name: 'new_module_spec' },
      method: 'get',
    };
    const data = await this.request(payload);
    if (!data) {
      return [];
    }

    const hosts: HostInfo[] = [];
    const hostList = (data.hosts_info as Record<string, unknown>)?.host_info as Array<Record<string, Record<string, string>>> ?? [];
    for (const item of hostList) {
      for (const hostKey in item) {
        try {
          const hostData = item[hostKey];
          const host = HostInfo.fromApiData(hostData);
          hosts.push(host);
        } catch (error) {
          console.log(`解析设备信息失败: ${(error as Error).message}`);
        }
      }
    }

    return hosts;
  }

  async findHostByMac(mac: string): Promise<HostInfo | null> {
    const normalizedMac = mac.toUpperCase().replace(/:/g, '-');
    for (const host of await this.getHosts()) {
      if (host.mac.toUpperCase() === normalizedMac) {
        return host;
      }
    }
    return null;
  }

  async findHostByIp(ip: string): Promise<HostInfo | null> {
    for (const host of await this.getHosts()) {
      if (host.ip === ip) {
        return host;
      }
    }
    return null;
  }
}
