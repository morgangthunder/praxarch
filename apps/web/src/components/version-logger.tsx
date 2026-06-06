"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Logs the running web build to the **browser** console on load and every
 * navigation so you can confirm hot-reload / deploy picked up the latest version.
 */
export function VersionLogger() {
  const pathname = usePathname();
  const version = process.env.NEXT_PUBLIC_WEB_VERSION ?? "unknown";

  useEffect(() => {
    console.log(`🟣 Praxarch Web v${version} — ${pathname}`);
  }, [pathname, version]);

  return null;
}
