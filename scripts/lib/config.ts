/**
 * Settings for the publish script: `.env` (AWS side, gitignored) plus
 * `images.cdnDomain` from src/site.config.ts (committed, used by the build).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { siteConfig } from '../../src/site.config.ts';

export interface PublishConfig {
  cdnDomain: string;
  bucket: string;
  region: string | undefined;
  profile: string | undefined;
  /** Set by IMAGES_LOCAL_STORE: write objects to this folder instead of S3. */
  localStoreDir: string | undefined;
  /** images.originals in src/site.config.ts: also publish full-resolution download copies. */
  originals: boolean;
}

export class ConfigError extends Error {}

export function loadEnv(root: string): void {
  const file = join(root, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

/**
 * @param needStore  true for a real publish: the bucket (or a local store folder) and the domain are required.
 */
export function loadConfig(root: string, needStore: boolean): PublishConfig {
  loadEnv(root);
  const env = process.env;
  const fromEnv = env.CLOUDFRONT_DOMAIN?.trim() ?? '';
  const fromSite = siteConfig.images.cdnDomain.trim();
  if (fromEnv && fromSite && fromEnv !== fromSite) {
    throw new ConfigError(
      `CLOUDFRONT_DOMAIN in .env (${fromEnv}) differs from images.cdnDomain in src/site.config.ts (${fromSite}). Make them equal.`,
    );
  }
  const cdnDomain = (fromSite || fromEnv).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const localStoreDir = env.IMAGES_LOCAL_STORE?.trim() || undefined;
  const bucket = env.S3_BUCKET?.trim() ?? '';

  if (needStore) {
    const missing: string[] = [];
    if (!cdnDomain) missing.push('CLOUDFRONT_DOMAIN (.env) or images.cdnDomain (src/site.config.ts)');
    if (!bucket && !localStoreDir) missing.push('S3_BUCKET (.env)');
    if (missing.length) {
      throw new ConfigError(`Missing settings: ${missing.join(', ')}. Copy .env.example to .env and fill it in (docs/IMAGES.md).`);
    }
  }
  return {
    cdnDomain,
    bucket,
    region: env.AWS_REGION?.trim() || undefined,
    profile: env.AWS_PROFILE?.trim() || undefined,
    localStoreDir,
    originals: siteConfig.images.originals === true,
  };
}
