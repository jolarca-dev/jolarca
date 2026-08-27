/**
 * Static test catalog data — mirrors scripts/seed_data.py so the suite
 * runs against the seeded Docker Compose stack without inventing records.
 * If a seed entry disappears, the journey tests fail loudly (they must
 * never fabricate data to compensate).
 */
export const SEEDED_CATEGORIES = [
  { slug: "crafts", name: "Baltic Crafts" },
  { slug: "home-garden", name: "Home & Garden" },
  { slug: "electronics", name: "Electronics" },
] as const;

export const SEEDED_PRODUCTS = [
  { title: "Amber pendant", categorySlug: "crafts" },
  { title: "Linen table runner", categorySlug: "home-garden" },
  { title: "Bluetooth speaker (refurb)", categorySlug: "electronics" },
] as const;

/** A product known to exist for search assertions. */
export const KNOWN_PRODUCT = SEEDED_PRODUCTS[0];

/** Guaranteed-zero-hit query: unpronounceable, never seeded. */
export const NONSENSE_QUERY = "zxqv-möö-9471-blik";

/** Listing payload for the seller journey (multilingual per the form). */
export const TEST_LISTING = {
  titleLt: `E2E test listing ${Date.now()}`,
  titleEn: "E2E test listing",
  description: "Automated end-to-end listing. Safe to moderate away.",
  category: "Baltic Crafts",
  price: "12.34",
  stock: "5",
} as const;
