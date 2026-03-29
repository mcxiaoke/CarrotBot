/**
 * 设备信息和 TP-Link 路由器接口模块
 *
 * 本模块定义了设备信息的数据结构和 TP-Link 路由器的 API 接口。
 * 支持获取路由器在线设备列表，解析设备信息等功能。
 */

import axios from 'axios'
import { logger } from '../logger.js'
/**
 * TP-Link 路由器密码加密常量
 * 用于实现路由器的自定义加密算法
 */
const STR_B = 'RDpbLfCPsJZ7fiv'
const STR_C =
    'yLwVl0zKqws7LgKPRQ84Mdt708T1qQ3Ha7xv3H7NyU84p21BriUWBU43odz3iP4rBL3cD02KZciXTysVXiV8ngg6vL48rPJyAUw0HurW20xqxv9aYb4M9wK1Ae0wlro510qXeU07kV57fQMc8L6aLgMLwygtc0F10a0Dg70TOoouyFhdysuRMO51yY5ZlOZZLEal1h0t9YQW0Ko7oBwmCAHoic4HYbUyVeU3sfQ1xtXcPcf1aT303wAQhv66qzW'

/**
 * WiFi 连接模式映射
 * 0: 有线连接
 * 1: 无线连接
 */
const WIFI_MODE_MAP: Record<number, string> = { 0: '有线', 1: '无线' }

/**
 * 物理层模式映射
 * 4: 2.4G WiFi
 * 5: 5G WiFi
 * 6: WiFi6
 */
const PHY_MODE_MAP: Record<number, string> = { 0: '未知', 4: '2.4G', 5: '5G', 6: 'WiFi6' }

/**
 * 格式化速度显示
 * @param speed - 速度（字节/秒）
 * @returns 格式化的速度字符串
 */
function formatSpeed(speed: number): string {
    if (speed < 1024) return `${speed} B/s`
    if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(1)} KB/s`
    return `${(speed / 1024 / 1024).toFixed(2)} MB/s`
}

/**
 * 格式化连接时间显示
 * @param seconds - 连接时长（秒）
 * @returns 格式化的时间字符串
 */
function formatConnectTime(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
    if (seconds < 86400)
        return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分钟`
    return `${Math.floor(seconds / 86400)}天${Math.floor((seconds % 86400) / 3600)}小时`
}

/**
 * 设备信息原始数据接口
 *
 * 对应路由器 API 返回的设备数据格式
 */
export interface HostInfoData {
    /** MAC 地址 */
    mac: string
    /** IP 地址 */
    ip: string
    /** 主机名（URL 编码） */
    hostname: string
    /** IPv6 地址 */
    ipv6: string
    /** 上传速度（字节/秒） */
    upSpeed: number
    /** 下载速度（字节/秒） */
    downSpeed: number
    /** 连接时长（秒） */
    connectTime: number
    /** WiFi 模式：0-有线，1-无线 */
    wifiMode: number
    /** 物理层模式：4-2.4G，5-5G，6-WiFi6 */
    phyMode: number
    /** 是否为当前设备 */
    isCurHost: boolean
    /** 是否被屏蔽 */
    blocked: boolean
}

/**
 * 设备信息类
 *
 * 封装设备的详细信息，提供格式化的属性访问。
 *
 * @example
 * ```typescript
 * const host = new HostInfo({
 *   mac: 'AA-BB-CC-DD-EE-FF',
 *   ip: '192.168.1.100',
 *   hostname: 'iPhone',
 *   wifiMode: 1,
 *   phyMode: 5
 * });
 *
 * console.log(host.hostnameDecoded); // 'iPhone'
 * console.log(host.wifiType);        // '无线'
 * console.log(host.phyType);         // '5G'
 * ```
 */
export class HostInfo {
    /** MAC 地址 */
    mac: string
    /** IP 地址 */
    ip: string
    /** 主机名（URL 编码） */
    hostname: string
    /** IPv6 地址 */
    ipv6: string
    /** 上传速度（字节/秒） */
    upSpeed: number
    /** 下载速度（字节/秒） */
    downSpeed: number
    /** 连接时长（秒） */
    connectTime: number
    /** WiFi 模式 */
    wifiMode: number
    /** 物理层模式 */
    phyMode: number
    /** 是否为当前设备 */
    isCurHost: boolean
    /** 是否被屏蔽 */
    blocked: boolean

    /**
     * 创建设备信息实例
     * @param data - 设备数据（部分可选）
     */
    constructor(data: Partial<HostInfoData> = {}) {
        this.mac = data.mac ?? ''
        this.ip = data.ip ?? ''
        this.hostname = data.hostname ?? ''
        this.ipv6 = data.ipv6 ?? ''
        this.upSpeed = data.upSpeed ?? 0
        this.downSpeed = data.downSpeed ?? 0
        this.connectTime = data.connectTime ?? 0
        this.wifiMode = data.wifiMode ?? 0
        this.phyMode = data.phyMode ?? 0
        this.isCurHost = data.isCurHost ?? false
        this.blocked = data.blocked ?? false
    }

    /**
     * 获取连接类型描述
     * @returns '有线' 或 '无线'
     */
    get wifiType(): string {
        return WIFI_MODE_MAP[this.wifiMode] ?? '未知'
    }

    /**
     * 获取物理层类型描述
     * @returns '2.4G'、'5G'、'WiFi6' 或 '未知'
     */
    get phyType(): string {
        return PHY_MODE_MAP[this.phyMode] ?? '未知'
    }

    /**
     * 获取解码后的主机名
     * @returns 解码后的主机名，未知设备返回 '未知设备'
     */
    get hostnameDecoded(): string {
        return this.hostname ? decodeURIComponent(this.hostname) : '未知设备'
    }

    /**
     * 获取格式化的连接时长
     * @returns 格式化的时间字符串
     */
    get connectTimeStr(): string {
        return formatConnectTime(this.connectTime)
    }

    /**
     * 获取格式化的上传速度
     * @returns 格式化的速度字符串
     */
    get upSpeedStr(): string {
        return formatSpeed(this.upSpeed)
    }

    /**
     * 获取格式化的下载速度
     * @returns 格式化的速度字符串
     */
    get downSpeedStr(): string {
        return formatSpeed(this.downSpeed)
    }

    /**
     * 从 API 数据创建设备信息实例
     * @param data - 路由器 API 返回的设备数据
     * @returns 设备信息实例
     */
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
            blocked: data.blocked === '1'
        })
    }

    /**
     * 转换为 JSON 对象
     * @returns 包含所有属性的 JSON 对象
     */
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
            blocked: this.blocked
        }
    }
}

/**
 * WAN 状态信息接口
 */
export interface WanStatus {
    /** 连接状态 */
    status: string
    /** IP 地址 */
    ip: string
    /** 子网掩码 */
    netmask: string
    /** 网关 */
    gateway: string
    /** DNS 服务器 */
    dns: string[]
    /** 连接类型 */
    connectType: string
}

/**
 * 易展扩展设备信息接口
 */
export interface ConnectedExt {
    /** 设备 MAC */
    mac: string
    /** 设备名称 */
    name: string
    /** 连接状态 */
    status: string
}

/**
 * TP-Link 路由器配置接口
 */
export interface TPLinkRouterOptions {
    /** 路由器 IP 地址 */
    ip: string
    /** 路由器管理密码 */
    password: string
}

/**
 * TP-Link 路由器类
 *
 * 提供 TP-Link 路由器的 API 接口，支持：
 * - 登录认证
 * - 获取在线设备列表
 * - 查询设备信息
 *
 * @example
 * ```typescript
 * const router = new TPLinkRouter({
 *   ip: '192.168.1.1',
 *   password: 'admin'
 * });
 *
 * const hosts = await router.getHosts();
 * const host = await router.findHostByMac('AA-BB-CC-DD-EE-FF');
 * ```
 */
export class TPLinkRouter {
    /** 路由器 IP 地址 */
    private ip: string
    /** 路由器管理密码 */
    private password: string
    /** 登录会话令牌 */
    private stok: string | null = null

    /**
     * 创建 TP-Link 路由器实例
     * @param options - 路由器配置
     */
    constructor(options: TPLinkRouterOptions) {
        this.ip = options.ip
        this.password = options.password
    }

    /**
     * 加密密码
     *
     * 使用 TP-Link 自定义算法加密密码。
     *
     * @param password - 原始密码
     * @returns 加密后的密码字符串
     */
    private securityEncode(password: string): string {
        let result = ''
        const pwdLen = password.length
        const bLen = STR_B.length
        const cLen = STR_C.length
        const maxLen = Math.max(pwdLen, bLen)

        for (let i = 0; i < maxLen; i++) {
            const k = i < pwdLen ? password.charCodeAt(i) : 187
            const l = i < bLen ? STR_B.charCodeAt(i) : 187
            result += STR_C[(k ^ l) % cLen]
        }
        return result
    }

    /**
     * 登录路由器
     *
     * 使用加密后的密码进行登录，获取会话令牌。
     *
     * @returns 登录是否成功
     */
    async login(): Promise<boolean> {
        const url = `http://${this.ip}/`
        const payload = {
            method: 'do',
            login: { password: this.securityEncode(this.password) }
        }

        try {
            const response = await axios.post(url, payload, {
                timeout: 5000,
                headers: { Connection: 'keep-alive' }
            })
            await new Promise((resolve) => setTimeout(resolve, 200))
            const data = response.data
            if (data.error_code === 0) {
                logger.info('路由器登录成功')
                this.stok = data.stok
                return true
            }
            logger.error(`路由器登录失败: ${JSON.stringify(data)}`)
        } catch (error) {
            logger.error(`路由器登录异常: ${(error as Error).message}`)
        }
        return false
    }

    /**
     * 确保已登录
     *
     * 检查是否有有效的会话令牌，如果没有则尝试登录。
     *
     * @returns 是否已登录
     */
    private async ensureLogin(): Promise<boolean> {
        if (!this.stok) {
            return await this.login()
        }
        return true
    }

    /**
     * 发送 API 请求
     *
     * 向路由器发送 API 请求，处理登录状态和错误。
     *
     * @param payload - 请求载荷
     * @returns 响应数据，失败返回 null
     */
    private async request(
        payload: Record<string, unknown>
    ): Promise<Record<string, unknown> | null> {
        if (!(await this.ensureLogin())) {
            return null
        }

        const url = `http://${this.ip}/stok=${this.stok}/ds`
        try {
            await new Promise((resolve) => setTimeout(resolve, 200))
            const response = await axios.post(url, payload, {
                timeout: 5000,
                headers: { Connection: 'keep-alive' }
            })
            const data = response.data
            // 检查错误码，非零表示需要重新登录
            if ('error_code' in data && data.error_code !== 0) {
                this.stok = null
                return null
            }
            return data
        } catch (error) {
            logger.error(`路由器请求异常: ${(error as Error).message}`)
            this.stok = null
            return null
        }
    }

    /**
     * 获取在线设备列表
     *
     * 从路由器获取当前在线的所有设备信息。
     *
     * @returns 设备信息列表
     */
    async getHosts(): Promise<HostInfo[]> {
        const payload = {
            hosts_info: { table: 'online_host' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取设备列表失败')
            return []
        }

        const hosts: HostInfo[] = []
        const hostList =
            ((data.hosts_info as Record<string, unknown>)?.online_host as Array<
                Record<string, Record<string, string>>
            >) ?? []
        for (const item of hostList) {
            for (const hostKey in item) {
                try {
                    const hostData = item[hostKey]
                    const host = HostInfo.fromApiData(hostData)
                    hosts.push(host)
                } catch (error) {
                    logger.error(`路由器解析设备信息失败: ${(error as Error).message}`)
                }
            }
        }

        // logger.debug(`路由器获取到 ${hosts.length} 台设备在线`)

        return hosts
    }

    /**
     * 根据 MAC 地址查找设备
     * @param mac - MAC 地址
     * @returns 设备信息，未找到返回 null
     */
    async findHostByMac(mac: string): Promise<HostInfo | null> {
        // 标准化 MAC 地址格式（使用横杠分隔）
        const normalizedMac = mac.toUpperCase().replace(/:/g, '-')
        for (const host of await this.getHosts()) {
            if (host.mac.toUpperCase() === normalizedMac) {
                return host
            }
        }
        return null
    }

    /**
     * 根据 IP 地址查找设备
     * @param ip - IP 地址
     * @returns 设备信息，未找到返回 null
     */
    async findHostByIp(ip: string): Promise<HostInfo | null> {
        for (const host of await this.getHosts()) {
            if (host.ip === ip) {
                return host
            }
        }
        return null
    }

    /**
     * 通用查询接口
     *
     * 发送自定义 payload 到路由器 API，适用于未封装的查询场景。
     *
     * @param payload - 自定义请求载荷
     * @returns 响应数据，失败返回 null
     *
     * @example
     * ```typescript
     * const data = await router.query({
     *   hosts_info: { table: 'online_host' },
     *   method: 'get'
     * });
     * ```
     */
    async query(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
        return await this.request(payload)
    }

    /**
     * 获取离线设备列表
     *
     * 从路由器获取历史连接过但当前离线的设备信息。
     *
     * @returns 离线设备信息列表
     */
    async getOfflineHosts(): Promise<HostInfo[]> {
        const payload = {
            hosts_info: { table: 'offline_host' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取离线设备列表失败')
            return []
        }

        const hosts: HostInfo[] = []
        const hostList =
            ((data.hosts_info as Record<string, unknown>)?.offline_host as Array<
                Record<string, Record<string, string>>
            >) ?? []
        for (const item of hostList) {
            for (const hostKey in item) {
                try {
                    const hostData = item[hostKey]
                    const host = HostInfo.fromApiData(hostData)
                    hosts.push(host)
                } catch (error) {
                    logger.error(`路由器解析离线设备信息失败: ${(error as Error).message}`)
                }
            }
        }

        logger.debug(`路由器获取到 ${hosts.length} 台离线设备`)
        return hosts
    }

    /**
     * 获取所有设备信息（包含在线和离线）
     *
     * @returns 设备信息列表
     */
    async getAllHosts(): Promise<HostInfo[]> {
        const payload = {
            hosts_info: { table: ['host_info', 'offline_host'], name: 'cap_host_num' },
            network: { name: ['iface_mac', 'lan'] },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取所有设备列表失败')
            return []
        }

        const hosts: HostInfo[] = []
        const hostsInfo = data.hosts_info as Record<string, unknown> | undefined

        const hostInfoList =
            (hostsInfo?.host_info as Array<Record<string, Record<string, string>>>) ?? []
        for (const item of hostInfoList) {
            for (const hostKey in item) {
                try {
                    const host = HostInfo.fromApiData(item[hostKey])
                    hosts.push(host)
                } catch (error) {
                    logger.error(`路由器解析设备信息失败: ${(error as Error).message}`)
                }
            }
        }

        const offlineHostList =
            (hostsInfo?.offline_host as Array<Record<string, Record<string, string>>>) ?? []
        for (const item of offlineHostList) {
            for (const hostKey in item) {
                try {
                    const host = HostInfo.fromApiData(item[hostKey])
                    hosts.push(host)
                } catch (error) {
                    logger.error(`路由器解析离线设备信息失败: ${(error as Error).message}`)
                }
            }
        }

        logger.debug(`路由器获取到 ${hosts.length} 台设备（含离线）`)
        return hosts
    }

    /**
     * 获取 WAN 状态
     *
     * @returns WAN 状态信息，失败返回 null
     */
    async getWanStatus(): Promise<Record<string, unknown> | null> {
        const payload = {
            network: { name: ['wan_status', 'wan_status_2'] },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取 WAN 状态失败')
            return null
        }
        return data.network as Record<string, unknown>
    }

    /**
     * 获取 IPv6 和 DHCP 信息
     *
     * @returns 网络协议信息，失败返回 null
     */
    async getNetworkProtocol(): Promise<Record<string, unknown> | null> {
        const payload = {
            network: { name: ['wan_status', 'wanv6_status'] },
            protocol: { name: ['dhcp', 'ipv6_info'] },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取网络协议信息失败')
            return null
        }
        return data
    }

    /**
     * 获取易展连接的扩展设备
     *
     * 用于获取通过易展功能连接的扩展路由器信息。
     *
     * @returns 扩展设备列表
     */
    async getConnectedExt(): Promise<Record<string, unknown>[]> {
        const payload = {
            hyfi: { table: ['connected_ext'] },
            hosts_info: { table: 'online_host', name: 'cap_host_num' },
            wireless: { table: ['sta_bind_rule', 'sta_bind_rule_status'] },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取易展扩展设备失败')
            return []
        }

        const extList =
            ((data.hyfi as Record<string, unknown>)?.connected_ext as Array<
                Record<string, unknown>
            >) ?? []
        logger.debug(`路由器获取到 ${extList.length} 台易展扩展设备`)
        return extList
    }

    /**
     * 获取系统信息
     *
     * 包含系统模式、固件版本等信息。
     *
     * @returns 系统信息，失败返回 null
     */
    async getSystemInfo(): Promise<Record<string, unknown> | null> {
        const payload = {
            system: { name: ['sys_mode'] },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取系统信息失败')
            return null
        }
        return data.system as Record<string, unknown>
    }

    /**
     * 获取设备状态和固件信息
     *
     * @returns 设备状态信息，失败返回 null
     */
    async getDeviceStatus(): Promise<Record<string, unknown> | null> {
        const payload = {
            network: { name: ['wan_status', 'wan_status_2'] },
            cloud_config: { name: ['new_firmware', 'device_status', 'bind'] },
            system: { name: 'sys_mode' },
            wireless: { name: ['wlan_wds_2g', 'wlan_wds_5g'] },
            hyfi: { table: 'connected_ext' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取设备状态失败')
            return null
        }
        return data
    }

    /**
     * 获取无线 WDS 信息
     *
     * @returns WDS 信息，失败返回 null
     */
    async getWirelessWds(): Promise<Record<string, unknown> | null> {
        const payload = {
            wireless: { name: ['wlan_wds_2g', 'wlan_wds_5g'] },
            system: { name: 'sys_mode' },
            port_manage: { table: 'mwan' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取无线 WDS 信息失败')
            return null
        }
        return data
    }

    /**
     * 获取端口设备信息
     *
     * 包含各端口的状态和配置信息。
     *
     * @returns 端口设备信息，失败返回 null
     */
    async getPortDevInfo(): Promise<Record<string, unknown> | null> {
        const payload = {
            port_manage: { table: 'dev_info' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取端口设备信息失败')
            return null
        }
        return data
    }

    /**
     * 获取 WAN 协议配置
     *
     * @returns WAN 协议配置，失败返回 null
     */
    async getWanProtocol(): Promise<Record<string, unknown> | null> {
        const payload = {
            protocol: { name: 'wan' },
            function: { name: 'new_module_spec' },
            system: { name: 'sys_mode' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取 WAN 协议配置失败')
            return null
        }
        return data
    }

    /**
     * 获取网络连接状态
     *
     * 包含 WAN 连接状态、PPPoE 配置、在线检测等。
     *
     * @returns 网络连接状态，失败返回 null
     */
    async getNetworkConnectStatus(): Promise<Record<string, unknown> | null> {
        const payload = {
            protocol: { name: ['wan', 'pppoe'] },
            network: { name: ['wan_status', 'iface_mac'] },
            wan_port_detect: { name: 'config' },
            online_check: { name: 'wan' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取网络连接状态失败')
            return null
        }
        return data
    }

    /**
     * 获取 IPv6 开关状态
     *
     * @returns IPv6 开关状态，失败返回 null
     */
    async getIpv6SwitchStatus(): Promise<Record<string, unknown> | null> {
        const payload = {
            network: { name: 'ipv6_switch_status' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取 IPv6 开关状态失败')
            return null
        }
        return data
    }

    /**
     * 获取 IPv6 详细信息
     *
     * @returns IPv6 详细信息，失败返回 null
     */
    async getIpv6Info(): Promise<Record<string, unknown> | null> {
        const payload = {
            protocol: { name: 'ipv6_info' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取 IPv6 详细信息失败')
            return null
        }
        return data
    }

    /**
     * 获取 LAN IPv6 状态
     *
     * 包含 DHCPv6、SLAAC、RDNSS 配置。
     *
     * @returns LAN IPv6 状态，失败返回 null
     */
    async getLanIpv6Status(): Promise<Record<string, unknown> | null> {
        const payload = {
            network: { name: 'lanv6_status' },
            protocol: { name: ['dhcpsv6', 'slaac', 'rdnss'] },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取 LAN IPv6 状态失败')
            return null
        }
        return data
    }

    /**
     * 获取 LAN 配置
     *
     * 包含 LAN 口 IP 地址、子网掩码等配置。
     *
     * @returns LAN 配置，失败返回 null
     */
    async getLanConfig(): Promise<Record<string, unknown> | null> {
        const payload = {
            network: { name: 'lan' },
            method: 'get'
        }
        const data = await this.request(payload)
        if (!data) {
            logger.error('路由器获取 LAN 配置失败')
            return null
        }
        return data
    }

    /**
     * 重启路由器
     *
     * @returns 操作是否成功
     */
    async reboot(): Promise<boolean> {
        // not implemented
        logger.info('路由器重启功能未实现')
        return true
    }

    /**
     * 恢复出厂设置
     *
     * @returns 操作是否成功
     */
    async factoryReset(): Promise<boolean> {
        // not implemented
        logger.info('路由器恢复出厂设置功能未实现')
        return true
    }

    /**
     * 断开 WAN 连接
     *
     * @returns 操作是否成功
     */
    async disconnectWan(): Promise<boolean> {
        // not implemented
        logger.info('路由器断开 WAN 连接功能未实现')
        return true
    }

    /**
     * 连接 WAN
     *
     * @returns 操作是否成功
     */
    async connectWan(): Promise<boolean> {
        // not implemented
        logger.info('路由器连接 WAN 功能未实现')
        return true
    }
}
