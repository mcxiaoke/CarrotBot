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

function getDatePath(platform?: string): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dir = platform
    ? join(cachePath, 'media', platform, dateStr)
    : join(cachePath, 'media', dateStr);
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
  aesKey?: string,
  platform?: string
): Promise<{ path: string; filename: string; size: number }> {
  const datePath = getDatePath(platform);
  const ext = getExtensionFromUrl(url, type === 'image' ? 'jpg' : type === 'voice' ? 'amr' : type === 'video' ? 'mp4' : 'bin');
  const filename = generateFilename(type, ext);
  const filePath = join(datePath, filename);

  try {
    logger.debug({ url, type, platform }, 'Downloading media');
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    let buffer = Buffer.from(response.data);

    await writeFile(filePath, buffer);

    logger.debug({ path: filePath, size: buffer.length, platform }, 'Downloaded media');
    return { path: filePath, filename, size: buffer.length };
  } catch (error) {
    logger.error({ error, url, platform }, 'Failed to download media');
    throw error;
  }
}

export async function saveBuffer(
  buffer: Buffer,
  type: 'image' | 'voice' | 'video' | 'file',
  ext?: string,
  platform?: string
): Promise<{ path: string; filename: string; size: number }> {
  const datePath = getDatePath(platform);
  const actualExt = ext || (type === 'image' ? 'jpg' : type === 'voice' ? 'amr' : type === 'video' ? 'mp4' : 'bin');
  const filename = generateFilename(type, actualExt);
  const filePath = join(datePath, filename);

  await writeFile(filePath, buffer);

  logger.debug({ path: filePath, size: buffer.length, platform }, 'Saved buffer');
  return { path: filePath, filename, size: buffer.length };
}

export function getCachedFiles(platform?: string): CachedFile[] {
  const mediaPath = join(cachePath, 'media');
  if (!existsSync(mediaPath)) return [];

  const files: CachedFile[] = [];
  
  const collectFiles = (dir: string) => {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const stat = statSync(entryPath);
      
      if (stat.isDirectory()) {
        collectFiles(entryPath);
      } else {
        files.push({
          path: entryPath,
          filename: entry,
          size: stat.size,
          createdAt: new Date(stat.birthtime),
        });
      }
    }
  };

  if (platform) {
    const platformPath = join(mediaPath, platform);
    collectFiles(platformPath);
  } else {
    collectFiles(mediaPath);
  }

  return files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function deleteCachedFile(path: string): boolean {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
      logger.debug({ path }, 'Deleted cached file');
      return true;
    }
    return false;
  } catch (error) {
    logger.error({ error, path }, 'Failed to delete cached file');
    return false;
  }
}

export function clearCacheBefore(date: string, platform?: string): number {
  const mediaPath = join(cachePath, 'media');
  if (!existsSync(mediaPath)) return 0;

  let deleted = 0;

  const clearDir = (dir: string, isPlatformDir: boolean = false) => {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        if (isPlatformDir || entry < date) {
          clearDir(entryPath);
          try {
            rmdirSync(entryPath);
            logger.info({ dir: entryPath }, 'Cleared cache directory');
          } catch {
            // Directory not empty, ignore
          }
        }
      } else if (!isPlatformDir && entry < date) {
        unlinkSync(entryPath);
        deleted++;
      }
    }
  };

  if (platform) {
    const platformPath = join(mediaPath, platform);
    clearDir(platformPath, true);
  } else {
    clearDir(mediaPath);
  }

  return deleted;
}

export function getCacheStats(platform?: string): { totalFiles: number; totalSize: number; byType: Record<string, number>; byPlatform: Record<string, number> } {
  const files = getCachedFiles(platform);
  const byType: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};

  for (const file of files) {
    const type = file.filename.split('_')[0] || 'unknown';
    byType[type] = (byType[type] || 0) + 1;

    const pathParts = file.path.split(/[/\\]/);
    const mediaIndex = pathParts.findIndex(p => p === 'media');
    if (mediaIndex >= 0 && pathParts[mediaIndex + 1]) {
      const potentialPlatform = pathParts[mediaIndex + 1];
      if (!potentialPlatform.match(/^\d{4}-\d{2}-\d{2}$/)) {
        byPlatform[potentialPlatform] = (byPlatform[potentialPlatform] || 0) + 1;
      }
    }
  }

  return {
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    byType,
    byPlatform,
  };
}

export function getCachePath(): string {
  return cachePath;
}
