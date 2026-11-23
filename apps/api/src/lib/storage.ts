import { Client } from 'minio';
import type { Readable } from 'node:stream';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { StorageUnavailableError } from '../middleware/errors.js';

export const STORAGE_BUCKETS = {
  assets: env.MINIO_BUCKET_ASSETS,
  evidence: env.MINIO_BUCKET_EVIDENCE,
} as const;

let client: Client | null = null;
const ensuredBuckets = new Set<string>();

export function getStorageClient(): Client {
  client ??= new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });
  return client;
}

export function storageErrorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

export function isMissingObjectError(error: unknown): boolean {
  const code = storageErrorCode(error);
  return code === 'NoSuchKey' || code === 'NoSuchBucket' || code === 'NotFound';
}

export async function ensureBucket(bucket: string): Promise<void> {
  if (ensuredBuckets.has(bucket)) return;
  try {
    const exists = await getStorageClient().bucketExists(bucket);
    if (!exists) await getStorageClient().makeBucket(bucket);
    ensuredBuckets.add(bucket);
  } catch (error) {
    logger.error({ err: error, bucket }, 'failed to ensure storage bucket');
    throw new StorageUnavailableError();
  }
}

export async function putObject(
  bucket: string,
  objectKey: string,
  data: Buffer,
  mimeType: string,
): Promise<void> {
  await ensureBucket(bucket);
  try {
    await getStorageClient().putObject(bucket, objectKey, data, data.length, {
      'Content-Type': mimeType,
      'Cache-Control': 'private, max-age=0, no-store',
    });
  } catch (error) {
    logger.error({ err: error, bucket, objectKey }, 'failed to store object');
    throw new StorageUnavailableError();
  }
}

export async function getObjectStream(bucket: string, objectKey: string): Promise<Readable> {
  try {
    return await getStorageClient().getObject(bucket, objectKey);
  } catch (error) {
    if (isMissingObjectError(error)) throw error;
    logger.error({ err: error, bucket, objectKey }, 'failed to read object');
    throw new StorageUnavailableError();
  }
}

export async function statObject(bucket: string, objectKey: string) {
  try {
    return await getStorageClient().statObject(bucket, objectKey);
  } catch (error) {
    if (isMissingObjectError(error)) throw error;
    logger.error({ err: error, bucket, objectKey }, 'failed to stat object');
    throw new StorageUnavailableError();
  }
}

export async function removeObject(bucket: string, objectKey: string): Promise<boolean> {
  try {
    await getStorageClient().removeObject(bucket, objectKey);
    return true;
  } catch (error) {
    if (isMissingObjectError(error)) return false;
    logger.warn({ err: error, bucket, objectKey }, 'failed to remove object');
    return false;
  }
}

export async function storageReady(): Promise<boolean> {
  try {
    await getStorageClient().listBuckets();
    return true;
  } catch {
    return false;
  }
}
