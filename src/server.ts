import Fastify, { FastifyInstance } from 'fastify';
import { logger } from './logger.js';
import { getLanService } from './router/lan_service.js';

export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: false,
  });

  fastify.get('/health', async () => {
    return { status: 'ok', uptime: process.uptime() };
  });

  fastify.get('/', async () => {
    return { name: 'CarrotBot', version: '1.0.0' };
  });

  fastify.register(async (instance) => {
    instance.get('/devices', async () => {
      const lanService = getLanService();
      if (!lanService) {
        return { success: false, error: 'LAN service not initialized' };
      }
      const hosts = lanService.getHosts();
      return {
        success: true,
        count: hosts.length,
        lastUpdate: lanService.getLastUpdate().toISOString(),
        hosts: hosts.map((h) => h.toJSON()),
      };
    });

    instance.get('/query', async (request) => {
      const lanService = getLanService();
      if (!lanService) {
        return { success: false, error: 'LAN service not initialized' };
      }
      const query = request.query as { mac?: string; ip?: string };
      const host = lanService.findHost(query.mac, query.ip);
      if (host) {
        return { success: true, online: true, host: host.toJSON() };
      }
      return { success: true, online: false, host: null, query };
    });

    instance.get('/status', async () => {
      const lanService = getLanService();
      if (!lanService) {
        return { success: false, error: 'LAN service not initialized' };
      }
      return { success: true, ...lanService.getStatus() };
    });
  }, { prefix: '/lan' });

  return fastify;
}
