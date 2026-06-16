'use client'

/**
 * Hook to track page views in Firebase Analytics on route changes.
 *
 * In Next.js, we use `usePathname` from `next/navigation` instead of
 * `useLocation` from `react-router-dom`.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics";

export function usePageView(): void {
  const pathname = usePathname();

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);
}
