import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, errorText } from "./api";

// ------------------------------------------------------------------ notifications

export type Notify = (type: "success" | "error", text: string) => void;

export const NotifyContext = createContext<Notify>(() => undefined);

export function useNotify(): Notify {
  return useContext(NotifyContext);
}

// ------------------------------------------------------------------ data loading

/**
 * Loads an admin API resource on mount. `reload()` fetches it again; `setData` allows
 * instant local updates after an action. Errors are shown as a toast.
 */
export function useAdminData<T>(path: string) {
  const notify = useNotify();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    api<T>(path)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError("");
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = errorText(err);
        setError(message);
        notify("error", message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [path, version, notify]);

  const reload = useCallback(() => {
    setRefreshing(true);
    setVersion((value) => value + 1);
  }, []);
  return { data, setData, loading, refreshing, error, reload };
}

// ------------------------------------------------------------------ pagination

export function usePaged<T>(items: T[], perPage: number, resetKey: unknown) {
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, totalPages);
  const pageItems = useMemo(() => items.slice((current - 1) * perPage, current * perPage), [items, current, perPage]);
  return { page: current, setPage, totalPages, pageItems, start: items.length ? (current - 1) * perPage + 1 : 0, end: Math.min(current * perPage, items.length) };
}

/** A timestamp fixed when the component mounts, for "older than N days" style calculations. */
export function useMountTime(): number {
  const [now] = useState(() => Date.now());
  return now;
}

// ------------------------------------------------------------------ table class names

export const th = "px-5 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-[#71806C] whitespace-nowrap";
export const td = "px-5 py-4 text-sm text-[#A6B399] align-middle";
export const tr = "border-b border-white/5 hover:bg-white/[0.025] transition";
