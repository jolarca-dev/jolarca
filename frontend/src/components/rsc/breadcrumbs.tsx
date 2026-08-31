import { JsonLd } from "@/components/rsc/json-ld";
import { Link } from "@/i18n/navigation";

export type Crumb = { href?: string; label: string };

/**
 * Breadcrumb trail (RSC) with Schema.org BreadcrumbList JSON-LD.
 * Last item is the current page: plain text, aria-current, ink-medium.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.label,
            ...(item.href ? { item: item.href } : {}),
          })),
        }}
      />
      <ol className="flex list-none flex-wrap items-center gap-2 p-0">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link
                href={item.href}
                className="text-ink-muted no-underline transition-dignified hover:text-primary hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
