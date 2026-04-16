import { DeleteObjectCommand, GetObjectCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { loadEnv } from '../config/env.js'
import { AppError } from './errors.js'

function getS3Config() {
  const env = loadEnv()
  if (!env.AWS_REGION || !env.S3_BUCKET || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new AppError('S3_NOT_CONFIGURED', 500, 'S3 upload is not configured')
  }
  return {
    region: env.AWS_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  }
}

export async function createPresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSec = 300,
): Promise<{ upload_url: string; file_url: string; expires_in: number }> {
  const cfg = getS3Config()
  const client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
  })
  const upload_url = await getSignedUrl(client, command, { expiresIn: expiresInSec })
  const file_url = `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`
  return { upload_url, file_url, expires_in: expiresInSec }
}

export async function uploadBufferToS3(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ file_url: string }> {
  const cfg = getS3Config()
  const client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  return { file_url: `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}` }
}

export async function deleteS3ObjectByKey(key: string): Promise<void> {
  const cfg = getS3Config()
  const client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
}

export async function createSignedGetUrl(key: string, expiresInSec = 3600): Promise<string> {
  const cfg = getS3Config()
  const client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
  })
  return getSignedUrl(client, command, { expiresIn: expiresInSec })
}
