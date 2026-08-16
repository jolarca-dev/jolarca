import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["lt", "lv", "et", "en"],
  defaultLocale: "en",
  localePrefix: "always",
});
