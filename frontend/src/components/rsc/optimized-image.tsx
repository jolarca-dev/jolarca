import Image from "next/image";

import { BLUR_DATA_URL } from "@/components/rsc/product-card";

/**
 * OptimizedImage — the canonical Next/Image wrapper for CWV discipline on
 * the self-hosted runner (built-in optimizer + sharp; no Vercel network).
 *
 * LCP rules:
 *  - exactly ONE above-fold image per page gets `priority` (preload, no
 *    lazy) — usually the hero or the first product card;
 *  - everything below the fold is `loading="lazy"` with a fixed-size box
 *    and blur placeholder → zero CLS;
 *  - `sizes` must match the layout context — presets below, override when
 *    the grid differs.
 */

/** Layout-context presets — keep sizes honest per breakpoint. */
export const IMAGE_SIZES = {
  /** Catalog grid: 3 cols desktop, 2 tablet, 1 mobile. */
  catalogGrid: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  /** Product detail gallery: half-width beside the buy box on desktop. */
  productDetail: "(min-width: 1024px) 50vw, 100vw",
  /** Full-bleed hero. */
  hero: "100vw",
  /** Small thumbs (cart drawer, palette suggestions). */
  thumb: "(min-width: 640px) 96px, 64px",
} as const;

export type ImageSizeContext = keyof typeof IMAGE_SIZES;

export function OptimizedImage({
  src,
  alt,
  width = 600,
  height = 600,
  priority = false,
  sizeContext = "catalogGrid",
  sizes,
  blurDataURL,
  className = "aspect-square w-full object-cover",
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** Above-fold LCP candidate only — never bulk-apply. */
  priority?: boolean;
  /** Layout context preset; `sizes` overrides when the grid differs. */
  sizeContext?: ImageSizeContext;
  sizes?: string;
  /**
   * Backend-provided blur hash/data URL when available; otherwise the
   * house neutral stone placeholder (tiny base64 SVG — no color
   * extraction service needed, no extra request).
   */
  blurDataURL?: string;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes ?? IMAGE_SIZES[sizeContext]}
      loading={priority ? undefined : "lazy"}
      priority={priority}
      placeholder="blur"
      blurDataURL={blurDataURL ?? BLUR_DATA_URL}
      className={className}
    />
  );
}
