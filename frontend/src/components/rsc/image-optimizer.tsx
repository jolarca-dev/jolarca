/**
 * Compatibility shim — the canonical image wrapper moved to
 * `src/components/rsc/optimized-image.tsx` (richer API: size-context
 * presets, backend blur-hash override). Existing imports keep working.
 */
export {
  IMAGE_SIZES,
  OptimizedImage,
  type ImageSizeContext,
} from "@/components/rsc/optimized-image";
