import Image from "next/image";

import { AddToCartButton } from "@/components/client/add-to-cart-button";
import { Link } from "@/i18n/navigation";
import { formatPrice, type Product } from "@/server/catalog";

/** Neutral blur placeholder until the backend ships real blur hashes.
 * Literal base64 of a tiny stone-colored SVG — no Buffer (client-safe). */
export const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNmNWYxZWIiLz48L3N2Zz4=";

/**
 * Product card — pure RSC, zero client JS except the Add-to-cart island.
 * Semantic article element; heading hierarchy stays flat (h3 inside grids).
 */
export function ProductCard({
  product,
  locale,
  priority = false,
}: {
  product: Product;
  locale: string;
  priority?: boolean;
}) {
  const image = product.image ?? product.images[0];
  const href = `/p/${product.slug}`;

  return (
    <article className="card transition-dignified hover:border-line-strong">
      <Link
        href={href}
        aria-label={product.title}
        className="block no-underline"
      >
        {image ? (
          <Image
            src={image.url}
            alt={image.alt || product.title}
            width={image.width ?? 600}
            height={image.height ?? 600}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            loading={priority ? undefined : "lazy"}
            priority={priority}
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            className="aspect-square w-full rounded-t-lg object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="aspect-square w-full rounded-t-lg bg-gold-soft"
          />
        )}
      </Link>
      <div className="space-y-1 p-4">
        <h3 className="font-sans text-base font-medium leading-snug">
          <Link href={href} className="text-ink no-underline hover:underline">
            {product.title}
          </Link>
        </h3>
        {product.seller && (
          <p className="text-sm text-ink-faint">{product.seller.name}</p>
        )}
        <p className="text-lg font-semibold text-primary-deep">
          {formatPrice(product.price_gross, product.currency, locale)}
        </p>
        <AddToCartButton
          productId={product.id}
          slug={product.slug}
          title={product.title}
          priceGross={product.price_gross}
          currency={product.currency}
          imageUrl={product.image?.url}
          sellerName={product.seller?.name}
        />
      </div>
    </article>
  );
}
