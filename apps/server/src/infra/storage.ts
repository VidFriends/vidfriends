// S3-compatible object storage (ADR-0009, ADR-0015): private bucket, short-lived presigned URLs.
// Keys are opaque and never contain user input (NFR-SEC-08).
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { Env } from '../config/env.js';

/** BR-MED-7: signed URLs live at most 15 minutes. */
export const MAX_URL_TTL_SECONDS = 15 * 60;

export interface Storage {
  bucket: string;
  ensureBucket(): Promise<void>;
  ping(): Promise<void>;
  putObject(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    contentLength?: number,
  ): Promise<void>;
  getObject(key: string, range?: string): Promise<Readable>;
  headObject(key: string): Promise<{ size: number; contentType: string | undefined } | null>;
  deleteObjects(keys: string[]): Promise<void>;
  listKeys(
    prefix: string,
  ): AsyncIterable<{ key: string; size: number; lastModified: Date | undefined }>;
  presignGet(key: string, ttlSeconds?: number, filename?: string): Promise<string>;
  presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    ttlSeconds?: number,
  ): Promise<string>;
  createMultipart(key: string, contentType: string): Promise<string>;
  presignPart(
    key: string,
    uploadId: string,
    partNumber: number,
    ttlSeconds?: number,
  ): Promise<string>;
  completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
}

export function createStorage(env: Env): Storage | null {
  if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  const base: S3ClientConfig = {
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    // Non-AWS stores reject the CRC32 checksums recent SDKs add to presigned PUTs (ADR-0015).
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
  const internal = new S3Client({
    ...base,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  });
  const publicEndpoint = env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT;
  const presigner = new S3Client({
    ...base,
    ...(publicEndpoint ? { endpoint: publicEndpoint } : {}),
  });
  const Bucket = env.S3_BUCKET;
  const ttl = (s?: number) => Math.min(s ?? MAX_URL_TTL_SECONDS, MAX_URL_TTL_SECONDS);

  return {
    bucket: Bucket,
    async ensureBucket() {
      try {
        await internal.send(new HeadBucketCommand({ Bucket }));
      } catch {
        try {
          await internal.send(new CreateBucketCommand({ Bucket }));
        } catch (err) {
          const name = (err as { name?: string }).name;
          if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw err;
        }
      }
    },
    async ping() {
      await internal.send(new HeadBucketCommand({ Bucket }));
    },
    async putObject(key, body, contentType, contentLength) {
      await internal.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: contentLength,
        }),
      );
    },
    async getObject(key, range) {
      const res = await internal.send(new GetObjectCommand({ Bucket, Key: key, Range: range }));
      return res.Body as Readable;
    },
    async headObject(key) {
      try {
        const res = await internal.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType };
      } catch (err) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async deleteObjects(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        if (!chunk.length) continue;
        await internal.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    },
    async *listKeys(prefix) {
      let token: string | undefined;
      do {
        const res = await internal.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const o of res.Contents ?? []) {
          if (o.Key) yield { key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified };
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
    },
    presignGet(key, ttlSeconds, filename) {
      return getSignedUrl(
        presigner,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ...(filename ? { ResponseContentDisposition: `inline; filename="${filename}"` } : {}),
        }),
        { expiresIn: ttl(ttlSeconds) },
      );
    },
    presignPut(key, contentType, contentLength, ttlSeconds) {
      return getSignedUrl(
        presigner,
        new PutObjectCommand({
          Bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: contentLength,
        }),
        {
          expiresIn: ttl(ttlSeconds),
          signableHeaders: new Set(['content-type', 'content-length']),
        },
      );
    },
    async createMultipart(key, contentType) {
      const res = await internal.send(
        new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }),
      );
      if (!res.UploadId) throw new Error('multipart upload not created');
      return res.UploadId;
    },
    presignPart(key, uploadId, partNumber, ttlSeconds) {
      return getSignedUrl(
        presigner,
        new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
        { expiresIn: ttl(ttlSeconds) },
      );
    },
    async completeMultipart(key, uploadId, parts) {
      await internal.send(
        new CompleteMultipartUploadCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts
              .slice()
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        }),
      );
    },
    async abortMultipart(key, uploadId) {
      await internal.send(
        new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }),
      );
    },
  };
}
