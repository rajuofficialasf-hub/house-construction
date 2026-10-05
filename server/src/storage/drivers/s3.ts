// TEMP: S3 is a stopgap until the NAS is ready for this app (NS-35). Remove this file, its line in
// storage/index.ts, the s3 branch in config.ts and its tests when production runs on the NAS.
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'node:stream';
import { StorageNotFoundError } from '../errors.js';
import type { StorageDriver } from '../types.js';

export interface S3DriverConfig {
  S3_BUCKET: string;
  S3_REGION: string;
  S3_ENDPOINT?: string | undefined;
  S3_FORCE_PATH_STYLE: boolean;
}

/** Timeouts in milliseconds; a stalled bucket fails the request instead of hanging it (NS-44, NE-ERR-03). */
export interface S3Timeouts {
  connectionTimeout: number;
  requestTimeout: number;
}

const DEFAULT_TIMEOUTS: S3Timeouts = { connectionTimeout: 5_000, requestTimeout: 30_000 };

function isNotFound(err: unknown): boolean {
  return err instanceof NoSuchKey || (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404);
}

/**
 * The S3 driver for AWS S3 or an S3-compatible service such as R2 (NS-40..NS-44). The bucket is
 * private and every file goes through the API; credentials come from the AWS environment variables
 * or the host's IAM role, never from config (NS-43). Server-side encryption is the bucket's default
 * setting (NS-40), checked when the bucket is set up, so no encryption header is sent.
 */
export function createS3Driver(config: S3DriverConfig, timeouts: S3Timeouts = DEFAULT_TIMEOUTS): StorageDriver {
  const client = new S3Client({
    region: config.S3_REGION,
    ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    // Without throwOnRequestTimeout the SDK only logs a warning when requestTimeout passes.
    requestHandler: { ...timeouts, throwOnRequestTimeout: true },
    maxAttempts: 2,
  });
  const Bucket = config.S3_BUCKET;

  return {
    name: 's3',

    async put(key, body, meta) {
      // lib-storage streams the body in parts, so an upload of unknown length never sits in memory (NS-04).
      const upload = new Upload({ client, params: { Bucket, Key: key, Body: body, ContentType: meta.contentType } });
      const failed = new Promise<never>((_, reject) => body.once('error', reject));
      try {
        await Promise.race([upload.done(), failed]);
      } catch (err) {
        await upload.abort().catch(() => undefined);
        throw err;
      }
    },

    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        if (!(result.Body instanceof Readable)) throw new Error('S3 returned a body that is not a Node stream');
        return result.Body;
      } catch (err) {
        if (isNotFound(err)) throw new StorageNotFoundError(key);
        throw err;
      }
    },

    async remove(key) {
      // S3 answers 204 for a key that is already gone, so this is safe to retry.
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}
