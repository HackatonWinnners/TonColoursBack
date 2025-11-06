import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import config from '../config/env.js';
import { normalizeHexColor } from '../utils/color.js';
import { buildColorSvg } from './svgGenerator.js';

let minioClient = null;

/**
 * Initialize MinIO client (S3-compatible)
 * Lazy initialization to avoid errors if MinIO is not configured
 */
function getMinioClient() {
  if (!minioClient && isMinioConfigured()) {
    minioClient = new S3Client({
      endpoint: config.minioEndpoint,
      region: config.minioRegion || 'us-east-1',
      credentials: {
        accessKeyId: config.minioAccessKey,
        secretAccessKey: config.minioSecretKey,
      },
      forcePathStyle: true, // Critical for MinIO compatibility
    });
  }
  return minioClient;
}

/**
 * Check if MinIO is properly configured
 */
export function isMinioConfigured() {
  return !!(
    config.minioEndpoint && 
    config.minioAccessKey && 
    config.minioSecretKey && 
    config.minioBucket
  );
}

/**
 * Generate deterministic S3 key for a color
 * Same color = same key (deduplication)
 * Format: svgs/RRGGBB.svg
 */
function generateObjectKey(color) {
  const normalized = normalizeHexColor(color).replace('#', '').toUpperCase();
  return `svgs/${normalized}.svg`;
}

/**
 * Get public URL for an object
 * Uses custom public URL if configured, otherwise MinIO endpoint
 */
function getPublicUrl(key) {
  // If custom public URL is set (e.g., CDN, ngrok, domain), use it
  if (config.minioPublicUrl) {
    const baseUrl = config.minioPublicUrl.replace(/\/$/, '');
    return `${baseUrl}/${config.minioBucket}/${key}`;
  }
  
  // Otherwise use MinIO endpoint directly
  const endpoint = config.minioEndpoint.replace(/\/$/, '');
  return `${endpoint}/${config.minioBucket}/${key}`;
}

/**
 * Check if object already exists in MinIO
 * Returns true if exists, false if not found
 */
async function objectExists(key) {
  const client = getMinioClient();
  if (!client) return false;

  try {
    await client.send(new HeadObjectCommand({
      Bucket: config.minioBucket,
      Key: key,
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // Re-throw other errors (permissions, network, etc.)
    console.error('[minioStorage] Error checking object existence:', error);
    throw error;
  }
}

/**
 * Upload SVG to MinIO with optimal settings
 * Features:
 * - Deduplication: same color = same object
 * - Public read access
 * - Aggressive caching (immutable SVGs)
 * - Proper content type
 * 
 * @param {string} color - Hex color (e.g., '#FF0000' or 'FF0000')
 * @returns {Promise<string>} Public URL of the uploaded SVG
 */
export async function uploadColorSvgToMinio(color) {
  const client = getMinioClient();
  if (!client) {
    throw new Error('MinIO not configured. Set MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, and MINIO_BUCKET');
  }

  const normalized = normalizeHexColor(color);
  const key = generateObjectKey(normalized);

  // Check if already exists (save bandwidth and time)
  const exists = await objectExists(key);
  if (exists) {
    console.log(`[minioStorage] SVG already exists for ${normalized}, skipping upload`);
    return getPublicUrl(key);
  }

  // Generate SVG
  const svg = buildColorSvg(normalized);
  const buffer = Buffer.from(svg, 'utf8');

  // Upload with optimal settings
  const command = new PutObjectCommand({
    Bucket: config.minioBucket,
    Key: key,
    Body: buffer,
    ContentType: 'image/svg+xml',
    ContentLength: buffer.length,
    CacheControl: 'public, max-age=31536000, immutable', // 1 year cache, immutable
    ACL: 'public-read', // Make publicly accessible
    Metadata: {
      color: normalized,
      generatedAt: new Date().toISOString(),
      source: 'ton-colours-backend',
    },
  });

  try {
    await client.send(command);
    console.log(`[minioStorage] Successfully uploaded SVG for ${normalized} to ${key}`);
  } catch (error) {
    console.error(`[minioStorage] Failed to upload SVG for ${normalized}:`, error);
    throw new Error(`Failed to upload SVG to MinIO: ${error.message}`);
  }

  return getPublicUrl(key);
}

/**
 * Get public URL for a color's SVG (synchronous)
 * Assumes the SVG has already been uploaded
 * Use this for generating metadata after minting
 * 
 * @param {string} color - Hex color
 * @returns {string} Public URL
 */
export function getColorSvgUrl(color) {
  if (!isMinioConfigured()) {
    throw new Error('MinIO not configured');
  }
  
  const normalized = normalizeHexColor(color);
  const key = generateObjectKey(normalized);
  return getPublicUrl(key);
}

/**
 * Bulk upload multiple colors (optimization for pre-generation)
 * Useful for pre-populating common colors
 * 
 * @param {string[]} colors - Array of hex colors
 * @returns {Promise<{success: string[], failed: string[]}>}
 */
export async function bulkUploadColors(colors) {
  const results = { success: [], failed: [] };
  
  for (const color of colors) {
    try {
      await uploadColorSvgToMinio(color);
      results.success.push(color);
    } catch (error) {
      console.error(`[minioStorage] Bulk upload failed for ${color}:`, error);
      results.failed.push(color);
    }
  }
  
  return results;
}

export default {
  uploadColorSvgToMinio,
  getColorSvgUrl,
  isMinioConfigured,
  bulkUploadColors,
};
