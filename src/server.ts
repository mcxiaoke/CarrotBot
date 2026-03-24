import Fastify, { FastifyInstance } from 'fastify';
import { logger } from './logger.js';
import { getLanService } from './router/lan_service.js';
import { queryMessages, getMessageById, countMessages, getStats, deleteMessagesBefore, type MessageQuery, type MessageRecord } from './storage/database.js';
import { getCachedFiles, deleteCachedFile, clearCacheBefore, getCacheStats } from './storage/cache.js';

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

  fastify.register(async (instance) => {
    instance.get('/messages', async (request) => {
      const query = request.query as MessageQuery;
      const messages = queryMessages(query);
      const total = countMessages(query);
      return {
        success: true,
        total,
        limit: query.limit || 50,
        offset: query.offset || 0,
        messages,
      };
    });

    instance.get('/messages/:id', async (request) => {
      const params = request.params as { id: string };
      const message = getMessageById(parseInt(params.id, 10));
      if (!message) {
        return { success: false, error: 'Message not found' };
      }
      return { success: true, message };
    });

    instance.get('/stats', async () => {
      const stats = getStats();
      return { success: true, ...stats };
    });

    instance.delete('/messages', async (request) => {
      const body = request.body as { before?: string } | undefined;
      if (!body?.before) {
        return { success: false, error: 'Missing "before" date parameter' };
      }
      const deleted = deleteMessagesBefore(body.before);
      return { success: true, deleted };
    });
  }, { prefix: '/msg' });

  fastify.register(async (instance) => {
    instance.get('/files', async () => {
      const files = getCachedFiles();
      const stats = getCacheStats();
      return { success: true, ...stats, files };
    });

    instance.delete('/files', async (request) => {
      const body = request.body as { before?: string } | undefined;
      if (!body?.before) {
        return { success: false, error: 'Missing "before" date parameter' };
      }
      const deleted = clearCacheBefore(body.before);
      return { success: true, deleted };
    });

    instance.delete('/files/:path', async (request) => {
      const params = request.params as { path: string };
      const decodedPath = decodeURIComponent(params.path);
      const deleted = deleteCachedFile(decodedPath);
      return { success: deleted };
    });
  }, { prefix: '/cache' });

  return fastify;
}
