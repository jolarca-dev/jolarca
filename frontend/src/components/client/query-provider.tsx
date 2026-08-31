"use client";

/**
 * React Query provider — browser singleton client (SSR-safe: server renders
 * get a fresh instance via getQueryClient). Wrap once in the locale layout.
 */
import { QueryClientProvider } from "@tanstack/react-query";

import { getQueryClient } from "@/hooks/use-api";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const client = getQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
