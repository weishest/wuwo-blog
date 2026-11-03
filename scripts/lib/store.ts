/**
 * Where published objects go. S3 for real use; a folder for tests and for a
 * run without AWS (`IMAGES_LOCAL_STORE=<dir>`). Neither can delete anything.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface ObjectStore {
  /** Human-readable target, for the summary. */
  describe(): string;
  exists(key: string): Promise<boolean>;
  put(key: string, body: Buffer, contentType: string, contentDisposition?: string): Promise<void>;
}

export function createLocalStore(dir: string): ObjectStore {
  return {
    describe: () => `folder ${dir}`,
    async exists(key) {
      return existsSync(join(dir, key));
    },
    async put(key, body) {
      const file = join(dir, key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
    },
  };
}

export interface S3StoreOptions {
  bucket: string;
  region?: string | undefined;
  /** Named or SSO profile. Resolved by the SDK's default credential chain. */
  profile?: string | undefined;
}

/** Loads the AWS SDK on demand so `--check`/`--dry-run` never need it. */
export async function createS3Store(opts: S3StoreOptions): Promise<ObjectStore> {
  const { S3Client, HeadObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  if (opts.profile) process.env.AWS_PROFILE = opts.profile;
  const client = new S3Client({ ...(opts.region && { region: opts.region }) });
  return {
    describe: () => `s3://${opts.bucket}`,
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: opts.bucket, Key: key }));
        return true;
      } catch (err) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
        throw err;
      }
    },
    async put(key, body, contentType, contentDisposition) {
      await client.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: CACHE_CONTROL,
          ...(contentDisposition && { ContentDisposition: contentDisposition }),
        }),
      );
    },
  };
}
