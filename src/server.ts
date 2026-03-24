import Fastify from 'fastify';
import { logger } from './logger.js';

export async function createServer() {
  const fastify = Fastify({
    logger: false,
  });

  fastify.get('/health', async () => {
    return { status: 'ok', uptime: process.uptime() };
  });

  fastify.get('/', async () => {
    return { name: 'CarrotBot', version: '1.0.0' };
  });

  return fastify;
}
