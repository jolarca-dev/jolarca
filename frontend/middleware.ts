import createMiddleware from "next-intl/middleware";

import { routing } from "./src/i18n/routing";

// Locale negotiation: Accept-Language → cookie → default. No PII involved;
// the choice is stored client-side only.
export default createMiddleware(routing);

export const config = {
  // Skip API, static assets, and Next internals.
  matcher: ["/", "/(lt|lv|et|en)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
