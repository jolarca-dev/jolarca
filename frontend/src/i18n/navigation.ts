import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

// Locale-aware navigation primitives — all internal links MUST use these so
// hreflang/locale prefixes stay correct (ADR-0003 UI-string side).
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
