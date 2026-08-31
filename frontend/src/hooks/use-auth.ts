"use client";

/**
 * Auth hooks over React Query v5. The session cookie is httpOnly — these
 * hooks only *read* backend state via getSession(); they store nothing.
 *
 * Policy deviations from the catalog defaults are intentional:
 *  - staleTime 0: identity must never render stale across navigation;
 *  - refetchOnWindowFocus: a session expired (or created) in another tab
 *    converges when the user returns;
 *  - retry false: a 401 is an answer, not a transient failure.
 */
import { useQuery } from "@tanstack/react-query";

import { getSession, type SessionUser } from "@/lib/auth";

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: getSession,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useIsAuthenticated(): boolean {
  const { data, isLoading } = useSession();
  if (isLoading) return false; // never flash authenticated UI prematurely
  return data != null;
}

export function useUser(): SessionUser | null {
  const { data } = useSession();
  return data ?? null;
}
