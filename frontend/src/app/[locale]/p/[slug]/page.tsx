import type { Metadata } from "next";
import DOMPurify from "isomorphic-dompurify";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AddToCartButton } from "@/components/client/add-to-cart-button";
import { ProductGallery } from "@/components/client/product-gallery";
import { JsonLd } from "@/components/rsc/json-ld";
import { ProductGrid } from "@/components/rsc/product-grid";
import { SkeletonGrid } from "@/components/rsc/skeleton-grid";
import { isApiError } from "@/lib/api-client";
import { localeAlternates } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { formatPrice, getProduct, getRelatedProducts } from "@/server/catalog";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://jol-marketplace.example";

interface RouteParams {
  locale: string;
  slug: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await getProduct(slug);
    return {
      title: product.title,
      description: DOMPurify.sanitize(product.description_html, {
        ALLOWED_TAGS: [],
      }).slice(0, 160),
      alternates: localeAlternates(`/p/${slug}`),
      openGraph: {
        title: product.title,
        url: `${SITE_URL}/p/${slug}`,
        ...(product.image ? { images: [{ url: product.image.url }] } : {}),
      },
    };
  } catch {
    // Metadata must never crash the render; page body carries the notice.
    return { title: slug };
  }
}

/** Related products stream independently — never block the main content. */
async function RelatedProducts({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}) {
  const t = await getTranslations("catalog");
  try {
    const related = await getRelatedProducts(slug);
    if (related.length === 0) return null;
    return (
      <section aria-labelledby="related-products" className="mt-16">
        <h2 id="related-products" className="text-2xl text-primary-deep">
          {t("related")}
        </h2>
        <div className="mt-6">
          <ProductGrid products={related} locale={locale} />
        </div>
      </section>
    );
  } catch {
    // GAP-P04 closed: the rail is optional merchandising — if the backend
    // is having a moment, it degrades to silence while the PDP stays loud.
    return null;
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");

  let product;
  try {
    product = await getProduct(slug);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    // GAP-P03 closed: runtime failures degrade to a visible error note,
    // never a silent blank (ADR-0007).
    const te = await getTranslations("errors");
    return (
      <main className="mx-auto max-w-6xl p-8">
        <p role="status" className="card p-6 text-ink-muted">
          {te("serverError")}
        </p>
      </main>
    );
  }

  const images =
    product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [];

  // UGC description: sanitized server-side before it ever reaches the DOM.
  const cleanDescription = DOMPurify.sanitize(product.description_html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "form", "style"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });

  const productUrl = `${SITE_URL}/p/${product.slug}`;

  return (
    <main className="mx-auto max-w-6xl p-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.title,
          url: productUrl,
          ...(images[0] ? { image: images[0].url } : {}),
          description: DOMPurify.sanitize(product.description_html, {
            ALLOWED_TAGS: [],
          }).slice(0, 500),
          offers: {
            "@type": "Offer",
            url: productUrl,
            priceCurrency: product.currency,
            price: product.price_gross,
            // VAT-inclusive pricing is the EU consumer default (OSS-aware
            // breakdown renders at checkout).
            priceSpecification: product.vat_note ?? "Includes VAT",
            availability: "https://schema.org/InStock",
          },
          ...(product.rating && product.rating.count > 0
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: product.rating.average,
                  reviewCount: product.rating.count,
                },
              }
            : {}),
          ...(product.seller
            ? {
                brand: { "@type": "Brand", name: product.seller.name },
              }
            : {}),
        }}
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <ProductGallery images={images} title={product.title} />

        <div>
          <h1 className="text-3xl font-semibold text-primary-deep">
            {product.title}
          </h1>

          <p className="mt-4 text-2xl font-semibold text-primary-deep">
            {formatPrice(product.price_gross, product.currency, locale)}
          </p>
          {product.vat_note && (
            <p className="text-sm text-ink-muted">{product.vat_note}</p>
          )}

          <div className="mt-6 max-w-sm">
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

          {product.seller && (
            <aside
              aria-label={t("soldBy")}
              className="card mt-8 flex items-center gap-3 p-4"
            >
              <div>
                <p className="text-sm text-ink-muted">{t("soldBy")}</p>
                <Link
                  href={`/sellers/${product.seller.slug}`}
                  className="font-medium text-primary-deep"
                >
                  {product.seller.name}
                </Link>
              </div>
              {product.seller.verified && (
                <span className="ms-auto rounded-full bg-success-soft px-3 py-1 text-sm text-success">
                  ✓ {t("verifiedBadge")}
                </span>
              )}
            </aside>
          )}

          {cleanDescription && (
            <div
              className="mt-8 max-w-none space-y-3 text-ink"
              // Sanitized above; never render raw UGC HTML.
              dangerouslySetInnerHTML={{ __html: cleanDescription }}
            />
          )}
        </div>
      </div>

      <Suspense fallback={<SkeletonGrid count={4} />}>
        <RelatedProducts slug={slug} locale={locale} />
      </Suspense>
    </main>
  );
}
