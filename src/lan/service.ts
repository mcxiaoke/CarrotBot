/**
 * LAN 服务管理模块
 *
 * 本模块提供局域网设备监控服务，通过定期从路由器获取在线设备列表，
 * 并缓存设备信息供其他模块查询使用。
 */

import { TPLinkRouter, HostInfo } from './devices.js'
import { logger } from '../logger.js'

/**
 * LAN 服务配置接口
 */
export interface LanServiceConfig {
    /** 路由器 IP 地址 */
    routerIp: string
    /** 路由器管理密码 */
    routerPassword: string
    /** 设备列表刷新间隔（毫秒） */
    refreshInterval: number
}

/**
 * LAN 服务类
 *
 * 负责管理局域网设备监控功能，包括：
 * - 定期从路由器获取在线设备列表
 * - 缓存设备信息
 * - 提供设备查询接口
 *
 * @example
 * ```typescript
 * const service = await initLanService({
 *   routerIp: '192.168.1.1',
 *   routerPassword: 'password',
 *   refreshInterval: 20000
 * });
 *
 * const hosts = service.getHosts();
 * const host = service.findHost('AA-BB-CC-DD-EE-FF');
 * ```
 */
export class LanService {
    /** TP-Link 路由器实例 */
    private router: TPLinkRouter

    /** 路由器 IP 地址 */
    private routerIp: string

    /** 刷新间隔（毫秒） */
    private refreshInterval: number

    /** 设备列表缓存 */
    private hostsCache: HostInfo[] = []

    /** 上次更新时间戳 */
    private lastUpdate = 0

    /** 是否正在刷新中 */
    private isRefreshing = false

    /** 定时刷新定时器 */
    private timer: NodeJS.Timeout | null = null

    /**
     * 创建 LAN 服务实例
     * @param config - 服务配置
     */
    constructor(config: LanServiceConfig) {
        this.routerIp = config.routerIp
        this.router = new TPLinkRouter({
            ip: config.routerIp,
            password: config.routerPassword
        })
        this.refreshInterval = config.refreshInterval
    }

    /**
     * 显示设备变化信息
     *
     * 对比新旧设备列表，打印新上线和离线的设备信息。
     *
     * @param oldHosts - 旧设备列表
     * @param newHosts - 新设备列表
     */
    private showChangedHosts(oldHosts: HostInfo[], newHosts: HostInfo[]): void {
        const oldMacSet = new Set(oldHosts.map((h) => h.mac.toUpperCase()))
        const newMacSet = new Set(newHosts.map((h) => h.mac.toUpperCase()))

        const newOnline: HostInfo[] = []
        const newOffline: HostInfo[] = []

        for (const host of newHosts) {
            if (!oldMacSet.has(host.mac.toUpperCase())) {
                newOnline.push(host)
            }
        }

        for (const host of oldHosts) {
            if (!newMacSet.has(host.mac.toUpperCase())) {
                newOffline.push(host)
            }
        }

        if (newOnline.length > 0) {
            for (const host of newOnline) {
                logger.info(
                    `新设备上线: ${host.hostnameDecoded} (${host.ip}, ${host.mac}, ${host.wifiType}-${host.phyType})`
                )
            }
        }

        if (newOffline.length > 0) {
            for (const host of newOffline) {
                logger.info(`设备离线: ${host.hostnameDecoded} (${host.ip}, ${host.mac})`)
            }
        }

        if (newHosts.length !== oldHosts.length || newOnline.length > 0 || newOffline.length > 0) {
            logger.info(`设备列表更新: ${newHosts.length} 台设备在线`)
        } else {
            // logger.debug(`设备列表未更新: ${newHosts.length} 台设备在线`)
        }
    }

    /**
     * 刷新设备列表
     *
     * 从路由器获取最新的在线设备列表并更新缓存。
     * 使用锁机制防止并发刷新。
     */
    async refreshHosts(): Promise<void> {
        if (this.isRefreshing) return
        this.isRefreshing = true

        try {
            const hosts = await this.router.getHosts()
            if (this.hostsCache.length > 0) {
                this.showChangedHosts(this.hostsCache, hosts)
            }
            this.hostsCache = hosts
            this.lastUpdate = Date.now()
        } catch (error) {
            const err = error as Error
            logger.error({ error: err.message }, '刷新设备列表失败')
        } finally {
            this.isRefreshing = false
        }
    }

    /**
     * 启动服务
     *
     * 立即执行一次刷新，然后启动定时刷新任务。
     */
    async start(): Promise<void> {
        logger.info(`LAN Service 启动，路由器: ${this.routerIp}`)
        // 立即刷新一次
        await this.refreshHosts()
        // 启动定时刷新
        this.timer = setInterval(() => this.refreshHosts(), this.refreshInterval)
    }

    /**
     * 停止服务
     *
     * 停止定时刷新任务。
     */
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    /**
     * 获取所有在线设备
     * @returns 设备列表
     */
    getHosts(): HostInfo[] {
        return this.hostsCache
    }

    /**
     * 获取上次更新时间
     * @returns 上次更新的时间
     */
    getLastUpdate(): Date {
        return new Date(this.lastUpdate)
    }

    /**
     * 根据 MAC 地址或 IP 地址查找设备
     *
     * @param mac - MAC 地址（可选）
     * @param ip - IP 地址（可选）
     * @returns 找到的设备信息，未找到返回 null
     */
    findHost(mac?: string, ip?: string): HostInfo | null {
        for (const host of this.hostsCache) {
            // 匹配 MAC 地址（支持冒号和横杠分隔符）
            if (mac && host.mac.toUpperCase() === mac.toUpperCase().replace(/:/g, '-')) {
                return host
            }
            // 匹配 IP 地址
            if (ip && host.ip === ip) {
                return host
            }
        }
        return null
    }

    /**
     * 获取服务状态
     * @returns 服务状态信息
     */
    getStatus() {
        return {
            uptime: process.uptime(),
            lastUpdate: this.getLastUpdate().toISOString(),
            cacheSize: this.hostsCache.length,
            refreshInterval: this.refreshInterval
        }
    }
}

/** LAN 服务单例实例 */
let lanServiceInstance: LanService | null = null

/**
 * 获取 LAN 服务实例
 * @returns LAN 服务实例，未初始化时返回 null
 */
export function getLanService(): LanService | null {
    return lanServiceInstance
}

/**
 * 初始化 LAN 服务
 *
 * 创建并启动 LAN 服务单例实例。
 * 如果已经初始化，直接返回现有实例。
 *
 * @param config - 服务配置
 * @returns LAN 服务实例
 */
export async function initLanService(config: LanServiceConfig): Promise<LanService> {
    if (lanServiceInstance) {
        return lanServiceInstance
    }
    lanServiceInstance = new LanService(config)
    await lanServiceInstance.start()
    return lanServiceInstance
}
