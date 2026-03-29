"use client";

import { useEffect } from "react";
import { API_CONFIG_ERROR, SOCKET_CONFIG_WARNING } from "@/constants/app";

export function EnvConfigBanner() {
  useEffect(() => {
    if (API_CONFIG_ERROR) {
      // eslint-disable-next-line no-console
      console.error("API base URL is not configured");
    }

    if (!API_CONFIG_ERROR && SOCKET_CONFIG_WARNING) {
      // eslint-disable-next-line no-console
      console.warn(SOCKET_CONFIG_WARNING);
    }
  }, []);

  if (!API_CONFIG_ERROR && !SOCKET_CONFIG_WARNING) {
    return null;
  }

  return (
    <div className="border-b border-app-danger/40 bg-app-danger/15 px-4 py-2 text-center text-sm text-app-text-primary">
      {API_CONFIG_ERROR || SOCKET_CONFIG_WARNING}
    </div>
  );
}
