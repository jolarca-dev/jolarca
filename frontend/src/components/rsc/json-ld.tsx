/**
 * JSON-LD injection helper (RSC). Structured data is rendered server-side
 * per page; keep schemas in sync with docs/ (SEO is a grant deliverable).
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Serialization is deterministic server-side; content is our own data.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
