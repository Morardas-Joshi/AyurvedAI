export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";
export const ADMIN_API = `${API_BASE}/api/admin`;

type ValidationIssue = { loc?: unknown[]; msg?: string };

function fieldLabel(loc: unknown[] | undefined): string {
  const parts = (loc ?? []).filter((part) => part !== "body").map(String);
  const last = parts[parts.length - 1] ?? "";
  return last.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());
}

function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((issue: ValidationIssue) => {
        const label = fieldLabel(issue.loc);
        const message = (issue.msg ?? "is invalid").replace(/^Value error, /, "");
        return label ? `${label}: ${message}` : message;
      })
      .join("; ");
  }
  return fallback;
}

type ApiOptions = Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit };

/** Calls an admin API path (or a full URL) and returns the parsed JSON, throwing a readable Error on failure. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { json, headers, body, ...rest } = options;
  const url = path.startsWith("http") ? path : `${ADMIN_API}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: json !== undefined ? JSON.stringify(json) : body,
    });
  } catch {
    throw new Error("Cannot reach the AyurvedAI server. Make sure the backend is running.");
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === "object" ? (data as { detail?: unknown }).detail : undefined;
    throw new Error(detailMessage(detail, `Request failed (${response.status})`));
  }
  return data as T;
}

export function errorText(error: unknown, fallback = "Something went wrong."): string {
  return error instanceof Error ? error.message : fallback;
}

// ------------------------------------------------------------------ formatting

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (Number.isNaN(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

export function titleCase(value: string | null | undefined): string {
  return (value ?? "").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Turns a raw User-Agent header into "Chrome on Windows" style text. */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /curl|python|httpx|PostmanRuntime/i.test(ua)
              ? "API client"
              : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iOS/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

// ------------------------------------------------------------------ CSV export

type CsvCell = string | number | boolean | null | undefined;

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  const escape = (cell: CsvCell) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
