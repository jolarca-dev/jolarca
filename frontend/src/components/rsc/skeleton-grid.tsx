/**
 * Server-side skeletons for Suspense fallbacks — zero client JS, CLS-safe.
 * Geometry mirrors the final components exactly (same grid, same aspect
 * ratios, same paddings) so the streamed content swaps in without layout
 * shift. Granular primitives (SkeletonText, SkeletonCard) let each section
 * ship a DISTINCT fallback shape.
 */

/** Text-line skeleton: 3–5 lines by default, last line shorter (natural). */
export function SkeletonText({ lines = 4 }: { lines?: number }) {
  const count = Math.min(5, Math.max(3, lines));
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`h-4 animate-pulse rounded bg-gold-soft ${
            i === count - 1 ? "w-1/2" : i % 2 === 0 ? "w-full" : "w-5/6"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Product-card skeleton — exact geometry of ProductCard: square image box,
 * then title line + seller/price lines inside the same p-4 padding.
 */
export function SkeletonCard({
  imageAspect = "aspect-square",
  textLines = 3,
}: {
  imageAspect?: string;
  textLines?: number;
}) {
  return (
    <div className="card overflow-hidden">
      <div className={`${imageAspect} w-full animate-pulse bg-gold-soft`} />
      <div className="p-4">
        <SkeletonText lines={textLines} />
      </div>
    </div>
  );
}

/**
 * Catalog grid skeleton — same column breakpoints as ProductGrid so the
 * streamed grid occupies identical space.
 */
export function SkeletonGrid({
  count = 6,
  label,
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label ?? "Loading"}
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Hero banner skeleton — matches the 21:9 hero geometry. */
export function HeroSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mb-12 w-full space-y-4">
      <div className="aspect-[21/9] w-full animate-pulse rounded-lg bg-gold-soft" />
      <div className="mx-auto max-w-2xl">
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}

/** Category-tile skeleton — shorter cards, 4-up on desktop. */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-2 gap-6 lg:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} imageAspect="aspect-[4/3]" textLines={3} />
      ))}
    </div>
  );
}
