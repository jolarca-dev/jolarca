import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LAUNCH_LOCALES } from "./config";

// Launch locales lt/lv/en; Lithuania is the launch market, so `lt` is the
// default and served WITHOUT a prefix (`localePrefix: "as-needed"`).
export const routing = defineRouting({
  locales: LAUNCH_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
});
