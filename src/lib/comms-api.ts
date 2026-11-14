import { useEffect, useState } from "react";

import { useToast } from "@/components/marswalk/toaster";
import {
  DUMMY_COMMS_LINK,
  DUMMY_COMMS_PASSES,
  type CommsLinkData,
  type CommsPassesData,
} from "@/data/comms";

/**
 * Comms backend seam. Set VITE_MARSWALK_API_URL (see .env.example) and the
 * Comms screens read:
 *
 *   GET {url}/comms/passes  ->  CommsPassesData
 *   GET {url}/comms/link    ->  CommsLinkData
 *
 * With no URL, or when a request fails, the screens keep the dummy data and
 * say so on screen.
 */
const API_URL = (import.meta.env.VITE_MARSWALK_API_URL as string | undefined)?.trim().replace(/\/+$/, "");

export type DataSource = "dummy" | "backend";
export type CommsResult<T> = { data: T; source: DataSource };

/** Words for the screen sub-heading: where the numbers on screen come from. */
export const SOURCE_LABEL: Record<DataSource, string> = {
  dummy: "dummy data, backend not connected",
  backend: "modelled by the comms backend",
};

function useCommsEndpoint<T extends object>(path: string, dummy: T): CommsResult<T> {
  const toast = useToast();
  const [result, setResult] = useState<CommsResult<T>>({ data: dummy, source: "dummy" });

  useEffect(() => {
    if (!API_URL) return;
    const controller = new AbortController();
    fetch(`${API_URL}${path}`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<T>;
      })
      .then((json) => {
        // A payload that lacks a top-level field would crash the screen; keep the dummy instead.
        const missing = Object.keys(dummy).filter((key) => json == null || !(key in json));
        if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
        setResult({ data: json, source: "backend" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn(`Comms backend ${path} failed, keeping dummy data:`, error);
        toast("Comms backend unreachable · showing dummy data", { safety: true });
      });
    return () => controller.abort();
  }, [path, dummy, toast]);

  return result;
}

export const useCommsPasses = () => useCommsEndpoint<CommsPassesData>("/comms/passes", DUMMY_COMMS_PASSES);
export const useCommsLink = () => useCommsEndpoint<CommsLinkData>("/comms/link", DUMMY_COMMS_LINK);
