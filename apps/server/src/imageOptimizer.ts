import path from 'path';
import fs from 'fs';

// Sharp is an optional dependency — import dynamically
let sharp: any = null;
try {
  sharp = require('sharp');
} catch {
  // sharp not installed — image optimization disabled
}

const THUMBNAIL_SIZE = 200;
const AVATAR_SIZE = 256;
const MAX_IMAGE_DIMENSION = 2048;

/**
 * Optimize an image: resize to reasonable dimensions, convert to WebP,
 * and generate a thumbnail.
 * Returns the path to the optimized file and thumbnail.
 */
export async function optimizeImage(
  filePath: string,
  options: { isAvatar?: boolean; generateThumbnail?: boolean } = {}
): Promise<{ optimizedPath: string; thumbnailPath?: string; width: number; height: number }> {
  if (!sharp) {
    return { optimizedPath: filePath, thumbnailPath: undefined, width: 0, height: 0 };
  }

  const { isAvatar = false, generateThumbnail = true } = options;

  const ext = path.extname(filePath).toLowerCase();
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath, ext);
  const outputPath = path.join(dir, `${basename}.webp`);
  const thumbnailPath = generateThumbnail
    ? path.join(dir, `${basename}_thumb.webp`)
    : undefined;

  try {
    const metadata = await sharp(filePath).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    let pipeline = sharp(filePath);

    // Resize
    if (isAvatar) {
      pipeline = pipeline.resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: 'cover',
        position: 'center',
      });
    } else {
      // For general images, limit max dimension
      pipeline = pipeline.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to WebP with good quality
    pipeline = pipeline.webp({ quality: 82, effort: 4 });

    // Write optimized image
    await pipeline.toFile(outputPath);

    // Generate thumbnail if requested
    if (generateThumbnail && thumbnailPath) {
      await sharp(filePath)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'cover',
          position: 'center',
        })
        .webp({ quality: 75, effort: 4 })
        .toFile(thumbnailPath);
    }

    // Get final dimensions
    const outputMeta = await sharp(outputPath).metadata();

    // Delete original file if it's not already WebP
    if (ext !== '.webp' && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      // Also delete original thumbnail if it exists
      const origThumb = path.join(dir, `${basename}_thumb${ext}`);
      if (fs.existsSync(origThumb)) {
        fs.unlinkSync(origThumb);
      }
    }

    return {
      optimizedPath: outputPath,
      thumbnailPath,
      width: outputMeta.width || originalWidth,
      height: outputMeta.height || originalHeight,
    };
  } catch (e) {
    console.error('Image optimization failed:', e);
    // Return original file info if optimization fails
    return {
      optimizedPath: filePath,
      thumbnailPath: undefined,
      width: 0,
      height: 0,
    };
  }
}

/**
 * Check if a file is an image based on extension.
 */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.tiff'].includes(ext);
}
