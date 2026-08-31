import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { BLUR_DATA_URL } from "@/components/rsc/product-card";
import { ProductGrid } from "@/components/rsc/product-grid";
import { Link } from "@/i18n/navigation";
import { getHomeContent } from "@/server/catalog";

/**
 * Independent streaming sections for the home page. Each fetches through the
 * cache()-deduplicated home payload (one request per render, three sections).
 * GAP-P01 is closed; on a runtime fetch failure a section degrades to a
 * visible, localized error note — never a silent blank (ADR-0007), and the
 * failure itself is already reported through the api-client error reporter.
 */

async function HomeSectionError() {
  const t = await getTranslations("errors");
  return (
    <p role="status" className="card mt-8 p-6 text-ink-muted">
      {t("serverError")}
    </p>
  );
}

export async function HomeHero() {
  try {
    const home = await getHomeContent();
    if (!home.hero) return null;
    const { hero } = home;
    return (
      <section
        aria-label="Hero"
        className="relative mb-12 overflow-hidden rounded-lg"
      >
        {hero.image && (
          <Image
            src={hero.image.url}
            alt={hero.image.alt || hero.title}
            width={hero.image.width ?? 1600}
            height={hero.image.height ?? 686}
            sizes="100vw"
            priority
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            className="aspect-[21/9] w-full object-cover"
          />
        )}
        <div
          className={
            hero.image
              ? "absolute inset-0 bg-ink/40 p-8"
              : "bg-primary px-6 py-16 sm:px-10"
          }
        >
          <h2
            className={`font-display text-3xl sm:text-4xl ${
              hero.image ? "text-surface-raised" : "text-surface"
            }`}
          >
            {hero.title}
          </h2>
          {hero.subtitle && (
            <p
              className={`mt-3 max-w-2xl text-lg ${
                hero.image ? "text-surface-raised" : "text-primary-soft"
              }`}
            >
              {hero.subtitle}
            </p>
          )}
        </div>
      </section>
    );
  } catch {
    return <HomeSectionError />;
  }
}

export async function HomeCategories() {
  const t = await getTranslations("catalog");
  try {
    const home = await getHomeContent();
    if (home.categories.length === 0) return null;
    return (
      <section aria-labelledby="home-categories" className="mt-12">
        <h2 id="home-categories" className="text-2xl text-primary-deep">
          {t("categories")}
        </h2>
        <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-4">
          {home.categories.map((category) => (
            <li key={category.slug}>
              <Link
                // Route shape /c/[category]/[slug]; flat home taxonomy uses
                // the slug for both segments until hierarchy lands.
                href={`/c/${category.slug}/${category.slug}`}
                className="card flex h-full flex-col justify-end p-4 no-underline text-ink transition-dignified hover:border-line-strong"
              >
                <span className="font-medium">{category.name}</span>
                {category.description && (
                  <span className="mt-1 text-sm text-ink-muted">
                    {category.description}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  } catch {
    return <HomeSectionError />;
  }
}

export async function FeaturedProducts({ locale }: { locale: string }) {
  const t = await getTranslations("catalog");
  try {
    const home = await getHomeContent();
    if (home.featured.length === 0) return null;
    return (
      <section aria-labelledby="home-featured" className="mt-12">
        <h2 id="home-featured" className="text-2xl text-primary-deep">
          {t("featured")}
        </h2>
        <div className="mt-6">
          <ProductGrid products={home.featured} locale={locale} />
        </div>
      </section>
    );
  } catch {
    return <HomeSectionError />;
  }
}
