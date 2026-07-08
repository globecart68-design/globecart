// src/modules/storage/storage.service.ts

import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-m4v',
  'video/x-matroska',
];

const ALLOWED_STORY_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;  //  20 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;
  private cloudfrontUrl?: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET');
    this.cloudfrontUrl = this.config.get<string>('AWS_CLOUDFRONT_URL');

    this.client = new S3Client({
      region: this.config.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  // ─────────────────────────────────────────────
  // Existing — avatar upload (unchanged)
  // ─────────────────────────────────────────────

  async uploadAvatar(file: Express.Multer.File): Promise<string> {
    const ext = file.originalname.split('.').pop();
    const key = `avatars/${randomUUID()}.${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    this.logger.log(`Uploaded avatar: ${key}`);
    return this.toUrl(key);
  }

  async deleteAvatar(avatarUrl: string): Promise<void> {
    const key = this.toKey(avatarUrl);
    if (!key) return;

    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    this.logger.log(`Deleted avatar: ${key}`);
  }

  // ─────────────────────────────────────────────
  // Story upload (server-side multipart)
  // Supports both images and videos
  // ─────────────────────────────────────────────

  async uploadStory(file: Express.Multer.File): Promise<string> {
    if (!ALLOWED_STORY_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}`,
      );
    }

    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File too large. Max size for ${isVideo ? 'video' : 'image'} is ${isVideo ? '200' : '20'} MB`,
      );
    }

    const ext = file.originalname.split('.').pop() ?? (isVideo ? 'mp4' : 'jpg');
    const folder = isVideo ? 'stories/videos' : 'stories/images';
    const key = `${folder}/${randomUUID()}.${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    this.logger.log(`Uploaded story ${isVideo ? 'video' : 'image'}: ${key}`);
    return this.toUrl(key);
  }

  // ─────────────────────────────────────────────
  // Pre-signed URL for direct Flutter → S3 upload
  // ─────────────────────────────────────────────

  async presignStoryUpload(
    userId: string,
    filename: string,
    mimeType: string,
    fileSize?: number,
  ): Promise<{ uploadUrl: string; publicUrl: string }> {
    if (!ALLOWED_STORY_TYPES.includes(mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }

    const isVideo = ALLOWED_VIDEO_TYPES.includes(mimeType);
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (fileSize && fileSize > maxBytes) {
      throw new BadRequestException(
        `File too large. Max size for ${isVideo ? 'video' : 'image'} is ${isVideo ? '200' : '20'} MB`,
      );
    }

    const ext = filename.split('.').pop() ?? (isVideo ? 'mp4' : 'jpg');
    const folder = isVideo ? 'stories/videos' : 'stories/images';
    const key = `${folder}/${userId}/${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ...(fileSize ? { ContentLength: fileSize } : {}),
    });

    // 5-minute window for Flutter to complete the upload
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: 300,
    });

    return { uploadUrl, publicUrl: this.toUrl(key) };
  }

  // ─────────────────────────────────────────────
  // Generic delete by URL
  // ─────────────────────────────────────────────

  async deleteFile(fileUrl: string): Promise<void> {
    const key = this.toKey(fileUrl);
    if (!key) return;

    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    this.logger.log(`Deleted file: ${key}`);
  }

  // ── uploadBuffer  (used by PostsService) ─────────────────────────────────────

   async uploadBuffer(
     buffer: Buffer,
     mimeType: string,
     folder: string,
   ): Promise<string> {
     const ext = mimeType.split('/')[1].replace('quicktime', 'mov');
     const key = `${folder}/${randomUUID()}.${ext}`;

await this.client.send(
       new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
         Body: buffer,
         ContentType: mimeType,
      }),
     );

    return this.cloudfrontUrl
      ? `${this.cloudfrontUrl}/${key}`
       : `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }
//
// ── deleteByUrl  (used by PostsService.delete) ───────────────────────────────

  async deleteByUrl(url: string): Promise<void> {
    // Extract key from CloudFront or S3 URL
     const origin = this.cloudfrontUrl ?? `https://${this.bucket}.s3.amazonaws.com`;
   const key = url.replace(`${origin}/`, '');

     await this.client.send(
       new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
     );
   }


  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private toUrl(key: string): string {
    if (this.cloudfrontUrl) {
      return `${this.cloudfrontUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  private toKey(url: string): string | null {
    try {
      const path = new URL(url).pathname;
      return path.startsWith('/') ? path.slice(1) : path;
    } catch {
      return null;
    }
  }
}