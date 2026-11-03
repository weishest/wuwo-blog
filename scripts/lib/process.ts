/**
 * Turns one source image into the objects to upload. Raster images are
 * auto-rotated from EXIF, stripped of all metadata (EXIF, GPS, ICC — output is
 * sRGB), capped at 2400px wide and encoded as WebP in several widths. GIF and
 * SVG are kept byte for byte. Object names carry a content hash of the
 * original, so re-publishing the same file never produces a new object.
 *
 * With `originals`, raster images also get a full-resolution download copy
 * (`<name>-<hash8>-original.<ext>`): same format family as the source (HEIC
 * becomes JPEG), auto-rotated, EXIF/GPS/XMP removed, ICC colour profile kept,
 * served with `Content-Disposition: attachment`.
 */
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import sharp, { type OutputInfo } from 'sharp';

export const VARIANT_WIDTHS = [480, 960, 1600, 2400];
export const MAX_WIDTH = 2400;
export const WEBP_QUALITY = 80;
export const MAX_BYTES = 25 * 1024 * 1024;

export interface ProcessedObject {
  key: string;
  body: Buffer;
  contentType: string;
  /** Set for download copies, e.g. `attachment; filename="photo.jpg"`. */
  contentDisposition?: string;
}

export interface ProcessedOriginal {
  key: string;
  width: number;
  height: number;
  bytes: number;
}

export interface ProcessedImage {
  /** Key of the largest (suffix-less) object; the manifest URL is `https://<domain>/<key>`. */
  key: string;
  width: number;
  height: number;
  /** Variant widths, ascending, including the largest. */
  widths: number[];
  objects: ProcessedObject[];
  /** The full-resolution download copy, when requested and the image is raster. */
  original?: ProcessedOriginal;
}

export interface ProcessOptions {
  /** Also produce a full-resolution download copy. */
  originals?: boolean;
}

const KEPT_AS_IS: Record<string, string> = { '.gif': 'image/gif', '.svg': 'image/svg+xml' };

export function hashOf(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

/** URL-safe object name from a file name's stem. */
export function slugName(filename: string): string {
  const stem = basename(filename, extname(filename));
  const slug = stem
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'image';
}

export class ImageError extends Error {}

/**
 * @param buf        original file bytes
 * @param filename   original file name (extension decides the pipeline)
 * @param keyPrefix  e.g. `blog/<slug>`
 */
export async function processImage(buf: Buffer, filename: string, keyPrefix: string, options: ProcessOptions = {}): Promise<ProcessedImage> {
  if (buf.length > MAX_BYTES) {
    throw new ImageError(`${filename} is ${(buf.length / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB`);
  }
  const ext = extname(filename).toLowerCase();
  const name = `${slugName(filename)}-${hashOf(buf)}`;

  const kept = KEPT_AS_IS[ext];
  if (kept) {
    const meta = await sharp(buf).metadata();
    const key = `${keyPrefix}/${name}${ext}`;
    return { key, width: meta.width, height: meta.height, widths: [meta.width], objects: [{ key, body: buf, contentType: kept }] };
  }

  const pipeline = () => sharp(buf, { autoOrient: true });
  let meta: Awaited<ReturnType<ReturnType<typeof pipeline>['metadata']>>;
  try {
    meta = await pipeline().metadata();
  } catch (err) {
    throw decodeError(filename, ext, err);
  }
  const orientedWidth = meta.autoOrient?.width ?? meta.width;
  const largest = Math.min(orientedWidth, MAX_WIDTH);
  const widths = [...VARIANT_WIDTHS.filter((w) => w < largest), largest];

  const objects: ProcessedObject[] = [];
  let height = 0;
  for (const w of widths) {
    let result: { data: Buffer; info: OutputInfo };
    try {
      result = await pipeline().resize({ width: w, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY }).toBuffer({ resolveWithObject: true });
    } catch (err) {
      throw decodeError(filename, ext, err);
    }
    if (w === largest) height = result.info.height;
    objects.push({ key: `${keyPrefix}/${name}${w === largest ? '' : `-${w}`}.webp`, body: result.data, contentType: 'image/webp' });
  }
  const result: ProcessedImage = { key: `${keyPrefix}/${name}.webp`, width: largest, height, widths, objects };
  if (options.originals) {
    const original = await originalObject(buf, filename, `${keyPrefix}/${name}`);
    objects.push(original.object);
    result.original = original.info;
  }
  return result;
}

/** Output format of the download copy for a source extension. */
const ORIGINAL_FORMATS: Record<string, { ext: string; contentType: string }> = {
  '.jpg': { ext: 'jpg', contentType: 'image/jpeg' },
  '.jpeg': { ext: 'jpg', contentType: 'image/jpeg' },
  '.heic': { ext: 'jpg', contentType: 'image/jpeg' },
  '.heif': { ext: 'jpg', contentType: 'image/jpeg' },
  '.png': { ext: 'png', contentType: 'image/png' },
  '.webp': { ext: 'webp', contentType: 'image/webp' },
  '.avif': { ext: 'avif', contentType: 'image/avif' },
};

/**
 * Full-resolution copy for download. sharp writes no metadata unless asked,
 * so EXIF (GPS, camera, dates) and XMP are dropped; only the ICC profile is
 * kept, so colours match the original.
 *
 * @param base  key without extension, e.g. `blog/trip/cover-a1b2c3d4`
 */
export async function originalObject(
  buf: Buffer,
  filename: string,
  base: string,
): Promise<{ object: ProcessedObject; info: ProcessedOriginal }> {
  const ext = extname(filename).toLowerCase();
  const format = ORIGINAL_FORMATS[ext];
  if (!format) throw new ImageError(`${filename}: no download copy for ${ext || 'this'} files`);
  const pipeline = sharp(buf, { autoOrient: true }).keepIccProfile();
  const encoded =
    format.ext === 'jpg'
      ? pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
      : format.ext === 'png'
        ? pipeline.png({ compressionLevel: 9 })
        : format.ext === 'webp'
          ? pipeline.webp({ quality: 95 })
          : pipeline.avif({ quality: 85 });
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await encoded.toBuffer({ resolveWithObject: true });
  } catch (err) {
    throw decodeError(filename, ext, err);
  }
  const key = `${base}-original.${format.ext}`;
  const downloadName = `${slugName(filename)}.${format.ext}`;
  return {
    object: { key, body: out.data, contentType: format.contentType, contentDisposition: `attachment; filename="${downloadName}"` },
    info: { key, width: out.info.width, height: out.info.height, bytes: out.data.length },
  };
}

function decodeError(filename: string, ext: string, err: unknown): ImageError {
  const detail = err instanceof Error ? err.message : String(err);
  if (ext === '.heic' || ext === '.heif') {
    return new ImageError(
      `${filename}: cannot decode HEIC (${detail}). sharp's prebuilt binaries have no HEVC decoder. ` +
        `Convert the file first (macOS: \`sips -s format jpeg photo.heic --out photo.jpg\`) or install sharp against a libvips with libheif.`,
    );
  }
  return new ImageError(`${filename}: cannot decode (${detail})`);
}
