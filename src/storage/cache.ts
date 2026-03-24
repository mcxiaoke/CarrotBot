import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { join, dirname } from 'path';
import { writeFile, readFile } from 'fs/promises';
import axios from 'axios';
import { logger } from '../logger.js';

export interface CacheConfig {
  cachePath: string;
}

export interface CachedFile {
  path: string;
  filename: string;
  size: number;
  createdAt: Date;
}

let cachePath = './data/cache';

export function initCache(config: CacheConfig): void {
  cachePath = config.cachePath;
  mkdirSync(cachePath, { recursive: true });
  mkdirSync(join(cachePath, 'media'), { recursive: true });
  logger.info(`Cache initialized: ${cachePath}`);
}

function getDatePath(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dir = join(cachePath, 'media', dateStr);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function generateFilename(type: string, ext: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${type}_${timestamp}_${random}.${ext}`;
}

function getExtensionFromUrl(url: string, defaultExt: string): string {
  const match = url.match(/\.(\w+)(?:\?|$)/);
  return match ? match[1] : defaultExt;
}

function getExtensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'audio/amr': 'amr',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
  };
  return map[mime] || 'bin';
}

export async function downloadMedia(
  url: string,
  type: 'image' | 'voice' | 'video' | 'file',
  aesKey?: string
): Promise<{ path: string; filename: string; size: number }> {
  const datePath = getDatePath();
  const ext = getExtensionFromUrl(url, type === 'image' ? 'jpg' : type === 'voice' ? 'amr' : type === 'video' ? 'mp4' : 'bin');
  const filename = generateFilename(type, ext);
  const filePath = join(datePath, filename);

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    let buffer = Buffer.from(response.data);

    await writeFile(filePath, buffer);

    logger.debug(`Downloaded media: ${filePath} (${buffer.length} bytes)`);
    return { path: filePath, filename, size: buffer.length };
  } catch (error) {
    logger.error({ error, url }, 'Failed to download media');
    throw error;
  }
}

export async function saveBuffer(
  buffer: Buffer,
  type: 'image' | 'voice' | 'video' | 'file',
  ext?: string
): Promise<{ path: string; filename: string; size: number }> {
  const datePath = getDatePath();
  const actualExt = ext || (type === 'image' ? 'jpg' : type === 'voice' ? 'amr' : type === 'video' ? 'mp4' : 'bin');
  const filename = generateFilename(type, actualExt);
  const filePath = join(datePath, filename);

  await writeFile(filePath, buffer);

  logger.debug(`Saved buffer: ${filePath} (${buffer.length} bytes)`);
  return { path: filePath, filename, size: buffer.length };
}

export function getCachedFiles(): CachedFile[] {
  const mediaPath = join(cachePath, 'media');
  if (!existsSync(mediaPath)) return [];

  const files: CachedFile[] = [];
  const dateDirs = readdirSync(mediaPath);

  for (const dateDir of dateDirs) {
    const datePath = join(mediaPath, dateDir);
    const stat = statSync(datePath);
    if (!stat.isDirectory()) continue;

    const dayFiles = readdirSync(datePath);
    for (const file of dayFiles) {
      const filePath = join(datePath, file);
      const fileStat = statSync(filePath);
      files.push({
        path: filePath,
        filename: file,
        size: fileStat.size,
        createdAt: new Date(fileStat.birthtime),
      });
    }
  }

  return files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function deleteCachedFile(path: string): boolean {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
      logger.debug(`Deleted cached file: ${path}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error({ error, path }, 'Failed to delete cached file');
    return false;
  }
}

export function clearCacheBefore(date: string): number {
  const mediaPath = join(cachePath, 'media');
  if (!existsSync(mediaPath)) return 0;

  let deleted = 0;
  const dateDirs = readdirSync(mediaPath);

  for (const dateDir of dateDirs) {
    if (dateDir < date) {
      const dirPath = join(mediaPath, dateDir);
      const files = readdirSync(dirPath);
      for (const file of files) {
        unlinkSync(join(dirPath, file));
        deleted++;
      }
      rmdirSync(dirPath);
      logger.info(`Cleared cache directory: ${dirPath}`);
    }
  }

  return deleted;
}

export function getCacheStats(): { totalFiles: number; totalSize: number; byType: Record<string, number> } {
  const files = getCachedFiles();
  const byType: Record<string, number> = {};

  for (const file of files) {
    const type = file.filename.split('_')[0] || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  }

  return {
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    byType,
  };
}

export function getCachePath(): string {
  return cachePath;
}
