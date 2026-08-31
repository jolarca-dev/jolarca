"use client";

/**
 * Client-side image helpers — used ONLY for non-sensitive assets (seller
 * logo, listing photos). KYC documents must never pass through these
 * helpers: they upload untouched to the backend (privacy-by-design).
 *
 * Conversion uses native browser APIs (createImageBitmap + canvas), no
 * image libraries in the bundle. If WebP encoding is unavailable the
 * original file is kept — the backend media queue converts as a fallback.
 */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB per file
export const MAX_LISTING_IMAGES = 5;

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function isWithinSizeLimit(file: File): boolean {
  return file.size <= MAX_IMAGE_BYTES;
}

/** Resize cap so phone photos (12MP+) don't blow the 2MB budget. */
const MAX_EDGE = 1600;

/** Convert to WebP (quality 0.85); falls back to the original blob. */
export async function convertToWebp(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    // Some browsers return a valid WebP larger than the source (tiny PNGs);
    // never make the payload worse.
    return webp && webp.size < file.size ? webp : file;
  } catch {
    return file;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

/** Object URL for previews — callers MUST revoke on replace/unmount. */
export function previewUrl(file: File | Blob): string {
  return URL.createObjectURL(file);
}
