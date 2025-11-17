/**
 * Storage Service - Abstraction for file storage
 *
 * Supports both local filesystem and AWS S3 storage
 * Automatically uses S3 when AWS credentials are configured
 *
 * Environment Variables:
 * - AWS_ACCESS_KEY_ID: AWS access key
 * - AWS_SECRET_ACCESS_KEY: AWS secret key
 * - AWS_S3_BUCKET: S3 bucket name
 * - AWS_REGION: AWS region (default: us-east-1)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createLogger } from './logger.js';

const logger = createLogger('Storage');

/**
 * Storage backend interface
 */
class StorageBackend {
  async upload(key, buffer, options) {
    throw new Error('Not implemented');
  }

  async download(key) {
    throw new Error('Not implemented');
  }

  async delete(key) {
    throw new Error('Not implemented');
  }

  async exists(key) {
    throw new Error('Not implemented');
  }

  async getSignedDownloadUrl(key, expiresIn) {
    throw new Error('Not implemented');
  }
}

/**
 * Local filesystem storage backend
 */
class LocalStorageBackend extends StorageBackend {
  constructor(baseDir) {
    super();
    this.baseDir = baseDir;
  }

  async upload(key, buffer, options = {}) {
    const filePath = path.join(this.baseDir, key);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    logger.info('File uploaded to local storage', { key, size: buffer.length });

    return {
      key,
      location: filePath,
      backend: 'local'
    };
  }

  async download(key) {
    const filePath = path.join(this.baseDir, key);
    const buffer = await fs.readFile(filePath);

    logger.info('File downloaded from local storage', { key, size: buffer.length });

    return buffer;
  }

  async delete(key) {
    const filePath = path.join(this.baseDir, key);
    await fs.rm(filePath, { force: true });

    logger.info('File deleted from local storage', { key });
  }

  async exists(key) {
    try {
      const filePath = path.join(this.baseDir, key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedDownloadUrl(key, expiresIn = 3600) {
    // For local storage, we can't generate signed URLs
    // Return a relative path or null
    const filePath = path.join(this.baseDir, key);
    return filePath;
  }
}

/**
 * AWS S3 storage backend
 */
class S3StorageBackend extends StorageBackend {
  constructor(config) {
    super();
    this.bucket = config.bucket;
    this.region = config.region || 'us-east-1';

    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });

    logger.info('S3 storage backend initialized', {
      bucket: this.bucket,
      region: this.region
    });
  }

  async upload(key, buffer, options = {}) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: options.contentType || 'application/pdf',
      Metadata: options.metadata || {}
    });

    await this.client.send(command);

    logger.info('File uploaded to S3', {
      bucket: this.bucket,
      key,
      size: buffer.length
    });

    return {
      key,
      location: `s3://${this.bucket}/${key}`,
      bucket: this.bucket,
      region: this.region,
      backend: 's3'
    };
  }

  async download(key) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    const response = await this.client.send(command);
    const buffer = await this._streamToBuffer(response.Body);

    logger.info('File downloaded from S3', {
      bucket: this.bucket,
      key,
      size: buffer.length
    });

    return buffer;
  }

  async delete(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    await this.client.send(command);

    logger.info('File deleted from S3', {
      bucket: this.bucket,
      key
    });
  }

  async exists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async getSignedDownloadUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    logger.info('Generated signed URL', {
      bucket: this.bucket,
      key,
      expiresIn
    });

    return url;
  }

  // Helper: Convert stream to buffer
  async _streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

/**
 * Storage Service - Main interface
 * Automatically selects backend based on environment configuration
 */
export class StorageService {
  constructor(options = {}) {
    const useS3 =
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_S3_BUCKET;

    if (useS3) {
      // Use S3 backend
      this.backend = new S3StorageBackend({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        bucket: process.env.AWS_S3_BUCKET,
        region: process.env.AWS_REGION || 'us-east-1'
      });

      logger.info('Storage service initialized with S3 backend', {
        bucket: process.env.AWS_S3_BUCKET,
        region: process.env.AWS_REGION || 'us-east-1'
      });
    } else {
      // Use local filesystem backend
      const baseDir = options.storageDir || path.resolve(process.cwd(), 'storage');
      this.backend = new LocalStorageBackend(baseDir);

      logger.info('Storage service initialized with local filesystem backend', {
        baseDir
      });
    }

    this.type = useS3 ? 's3' : 'local';
  }

  /**
   * Upload a file
   * @param {string} key - Storage key (e.g., "user-123/document-456.pdf")
   * @param {Buffer} buffer - File contents
   * @param {Object} options - Upload options (contentType, metadata)
   * @returns {Promise<Object>} Upload result
   */
  async upload(key, buffer, options = {}) {
    return this.backend.upload(key, buffer, options);
  }

  /**
   * Download a file
   * @param {string} key - Storage key
   * @returns {Promise<Buffer>} File contents
   */
  async download(key) {
    return this.backend.download(key);
  }

  /**
   * Delete a file
   * @param {string} key - Storage key
   */
  async delete(key) {
    return this.backend.delete(key);
  }

  /**
   * Check if a file exists
   * @param {string} key - Storage key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    return this.backend.exists(key);
  }

  /**
   * Get a signed download URL (for S3) or file path (for local)
   * @param {string} key - Storage key
   * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
   * @returns {Promise<string>} Download URL or file path
   */
  async getSignedDownloadUrl(key, expiresIn = 3600) {
    return this.backend.getSignedDownloadUrl(key, expiresIn);
  }

  /**
   * Get storage type
   * @returns {string} 's3' or 'local'
   */
  getType() {
    return this.type;
  }

  /**
   * Generate a storage key for a PDF
   * @param {string} ownerId - User/tenant ID
   * @param {string} documentId - Document ID
   * @returns {string} Storage key
   */
  static generatePdfKey(ownerId, documentId) {
    return `${ownerId}/${documentId}.pdf`;
  }
}

/**
 * Create and export a singleton storage service instance
 */
export function createStorageService(options = {}) {
  return new StorageService(options);
}
