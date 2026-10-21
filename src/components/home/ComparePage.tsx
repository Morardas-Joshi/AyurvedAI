import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import CompareTable, { type CompareItem, type CompareRow } from "./CompareTable";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type Kind = "herb" | "medicine";
type SearchResult = { kind: Kind; slug: string; name: string; score?: number; status?: string };
type CompareChip = SearchResult & { id: string };
type CompareResult = {
  kind: Kind;
  items: CompareItem[];
  rows: CompareRow[];
  similarity: number[][];
  similarity_components: { embedding: number; properties: number }[][];
  unresolved: { unresolved: string; suggestions: SearchResult[] }[];
  safety: { level: string; messages: string[]; disclaimer: string; show_professional_cta?: boolean };
  references: { source_id: string; title: string; page?: number | null; item: string }[];
  cache_hit?: boolean;
};
type SafetyNotice = CompareResult["safety"];
type StreamHandlers = {
  onDelta: (text: string) => void;
  onMeta: (data: { safety?: SafetyNotice; references?: CompareResult["references"] }) => void;
  onSafety: (safety: SafetyNotice) => void;
};
type CachedPage = {
  owner: string;
  kind: Kind;
  selected: CompareChip[];
  result: CompareResult | null;
  onlyDifferences: boolean;
};

let pageCache: CachedPage | null = null;

function errorText(cause: unknown): string {
  return cause instanceof TypeError
    ? "Cannot reach the server. Please check that the backend is running."
    : cause instanceof Error
      ? cause.message
      : "Something went wrong. Please try again.";
}

async function jsonRequest<T>(path: string, userKey: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "X-User-Id": userKey, ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail ?? `Request failed (${response.status})`);
  return data as T;
}

async function readSummaryStream(response: Response, handlers: StreamHandlers): Promise<void> {
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail ?? `Summary request failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const handleEvent = (event: string) => {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      if (data.type === "meta") {
        handlers.onMeta(data as { safety?: SafetyNotice; references?: CompareResult["references"] });
      } else if (data.type === "delta" && typeof data.text === "string") {
        handlers.onDelta(data.text);
      } else if (data.type === "done" && data.safety) {
        handlers.onSafety(data.safety as SafetyNotice);
      } else if (data.type === "error") {
        throw new Error(typeof data.message === "string" ? data.message : "The summary could not be completed.");
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const events = pending.split(/\r?\n\r?\n/);
    pending = events.pop() ?? "";
    for (const event of events) handleEvent(event);
    if (done) break;
  }
  if (pending.trim()) handleEvent(pending);
}

function makeText(result: CompareResult): string {
  const lines = [`${result.kind === "herb" ? "Herb" : "Medicine"} comparison`];
  for (const row of result.rows) {
    lines.push("", `${row.section} — ${row.label}`);
    result.items.forEach((item, index) => {
      const value = row.values[index];
      const text = Array.isArray(value)
        ? value.join(", ")
        : value && typeof value === "object"
          ? JSON.stringify(value)
          : typeof value === "string" && value.trim()
            ? value
            : "—";
      lines.push(`- ${item.name}: ${text}`);
    });
  }
  return lines.join("\n");
}

function chipId(item: SearchResult): string {
  return `${item.kind}:${item.slug || item.name.toLocaleLowerCase()}`;
}

export default function ComparePage({ userKey }: { userKey: string }) {
  const [searchParams] = useSearchParams();
  const linkedSlug = searchParams.get("item") ?? "";
  const linkedName = searchParams.get("name") ?? linkedSlug.replaceAll("-", " ");
  const linkedKind: Kind = searchParams.get("kind") === "medicine" ? "medicine" : "herb";
  const initial = pageCache?.owner === userKey ? pageCache : null;
  const [kind, setKind] = useState<Kind>(initial?.kind ?? (linkedSlug ? linkedKind : "herb"));
  const [selected, setSelected] = useState<CompareChip[]>(() => {
    const stored = initial?.selected ?? [];
    if (!linkedSlug || stored.some((item) => item.slug === linkedSlug && item.kind === linkedKind)) return stored;
    const linkedItem: CompareChip = {
      kind: linkedKind,
      slug: linkedSlug,
      name: linkedName,
      id: `${linkedKind}:${linkedSlug}`,
    };
    return [...stored.filter((item) => item.kind === linkedKind).slice(-3), linkedItem];
  });
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [result, setResult] = useState<CompareResult | null>(
    initial?.selected.some((item) => item.slug === linkedSlug && item.kind === linkedKind) || !linkedSlug
      ? initial?.result ?? null
      : null,
  );
  const [onlyDifferences, setOnlyDifferences] = useState(initial?.onlyDifferences ?? false);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [summarySafety, setSummarySafety] = useState<SafetyNotice | null>(null);
  const [summaryReferences, setSummaryReferences] = useState<CompareResult["references"]>([]);
  const [error, setError] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    pageCache = { owner: userKey, kind, selected, result, onlyDifferences };
  }, [userKey, kind, selected, result, onlyDifferences]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      const timer = window.setTimeout(() => setSuggestions([]), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void jsonRequest<{ results: SearchResult[] }>(
        `/api/herbs/${kind === "medicine" ? "medicines" : "search"}?q=${encodeURIComponent(trimmed)}&limit=10`,
        userKey,
        { signal: controller.signal },
      )
        .then((data) => {
          setSuggestions(data.results.filter((item) => item.kind === kind));
          setError("");
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setSuggestions([]);
          setError(errorText(cause));
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, kind, userKey]);

  const requestItems = useMemo(
    () => selected.map((item) => item.slug || item.name),
    [selected],
  );

  function addChip(item: SearchResult) {
    const id = chipId(item);
    if (selected.some((existing) => chipId(existing) === id)) {
      setNotice("That item is already in your comparison.");
      return;
    }
    if (selected.length >= 4) {
      setNotice("You can compare up to four items at a time.");
      return;
    }
    setSelected((current) => [...current, { ...item, id }]);
    setResult(null);
    setSummary("");
    setQuery("");
    setSuggestions([]);
    setError("");
    setNotice("");
  }

  function addTypedName() {
    const name = query.trim();
    if (!name) return;
    addChip({ kind, slug: "", name });
  }

  function changeKind(nextKind: Kind) {
    if (nextKind === kind) return;
    setKind(nextKind);
    setSelected([]);
    setResult(null);
    setSummary("");
    setQuery("");
    setSuggestions([]);
    setError("");
    setNotice("");
  }

  function removeChip(id: string) {
    setSelected((current) => current.filter((item) => item.id !== id));
    setResult(null);
    setSummary("");
  }

  function moveChip(id: string, delta: number) {
    setSelected((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
    setResult(null);
    setSummary("");
  }

  function dropChip(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setSelected((current) => {
      const from = current.findIndex((item) => item.id === draggedId);
      const to = current.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const reordered = [...current];
      const [item] = reordered.splice(from, 1);
      reordered.splice(to, 0, item);
      return reordered;
    });
    setDraggedId(null);
    setResult(null);
    setSummary("");
  }

  async function compare(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (selected.length < 2) {
      setError("Add at least two herbs or medicines before comparing.");
      return;
    }
    setLoading(true);
    setError("");
    setSummary("");
    setSummarySafety(null);
    try {
      const data = await jsonRequest<CompareResult>("/api/compare", userKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, items: requestItems }),
      });
      setResult(data);
      if (data.unresolved.length) {
        setError("Some names need clarification. Choose a suggested match, then compare again.");
      }
    } catch (cause) {
      setError(errorText(cause));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion(unresolvedName: string, suggestion: SearchResult) {
    const replacement = { ...suggestion, id: chipId(suggestion) };
    setSelected((current) => {
      const unresolvedChip = current.find((item) => item.name === unresolvedName && !item.slug);
      if (!unresolvedChip) {
        return current.some((item) => item.id === replacement.id)
          ? current
          : [...current.slice(0, 3), replacement];
      }
      return current.map((item) => item.id === unresolvedChip.id ? replacement : item);
    });
    setResult(null);
    setSummary("");
    setError("");
  }

  async function requestSummary() {
    if (result?.unresolved.length || result?.items.length !== selected.length) {
      setError("Resolve all names and compare again before requesting a summary.");
      return;
    }
    setSummaryLoading(true);
    setSummary("");
    setSummarySafety(null);
    setSummaryReferences([]);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/compare/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userKey },
        body: JSON.stringify({ kind, items: requestItems }),
      });
      await readSummaryStream(response, {
        onMeta: (data) => {
          setSummarySafety(data.safety ?? null);
          setSummaryReferences(data.references ?? []);
        },
        onDelta: (text) => setSummary((current) => current + text),
        onSafety: setSummarySafety,
      });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSummaryLoading(false);
    }
  }

  async function copyComparison() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(makeText(result));
      setNotice("Comparison copied as text.");
    } catch (cause) {
      setError(`Could not copy the comparison: ${errorText(cause)}`);
    }
  }

  return (
    <section className="compare-page mx-auto w-full max-w-[1100px] pb-12">
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .compare-hide-print { display: none !important; }
          .compare-page, .compare-page * { color: black !important; background: white !important; box-shadow: none !important; }
          .compare-page { max-width: none !important; padding: 0 !important; }
          .compare-page table { min-width: 0 !important; width: 100% !important; }
          .compare-page th, .compare-page td { border: 1px solid #bbb !important; }
          .compare-page [class*="overflow-x-auto"] { overflow: visible !important; }
        }
      `}</style>

      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A9C97C]">Reference comparison</p>
        <h2 className="font-display mt-2 text-3xl font-semibold text-[#EAF2DD]">Compare herbs &amp; medicines</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#B7C4A9]">
          Compare the details available in each reference profile. Missing facts are never guessed.
        </p>
      </div>

      <div className="compare-hide-print mb-5 flex gap-2" role="group" aria-label="Choose comparison type">
        {(["herb", "medicine"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => changeKind(value)}
            className={`rounded-full border px-4 py-2 text-sm font-medium capitalize ${
              kind === value ? "border-[#A9C97C]/60 bg-[#8FAF5A]/15 text-[#C9D8B5]" : "border-white/10 text-[#9FB08F] hover:bg-white/5"
            }`}
          >
            {value}s
          </button>
        ))}
      </div>

      <form className="compare-hide-print mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5" onSubmit={compare}>
        <label htmlFor="compare-picker" className="mb-2 block text-sm font-medium text-[#D5DFC9]">
          Search and add {kind === "herb" ? "herbs" : "medicines"}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="compare-picker"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSuggestions([]);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && query.trim() && suggestions.length === 0) {
                event.preventDefault();
                addTypedName();
              }
            }}
            placeholder={`Type a ${kind} name`}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/15 px-4 py-3 text-sm text-[#EAF2DD] outline-none placeholder:text-[#81917A] focus:border-[#A9C97C]/70"
          />
          <button
            type="button"
            onClick={addTypedName}
            disabled={!query.trim() || selected.length >= 4}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm text-[#C9D8B5] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add typed name
          </button>
        </div>
        {suggestions.length > 0 && (
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-[#102117] p-1" aria-label="Name suggestions">
            {suggestions.map((item) => (
              <li key={`${item.kind}-${item.slug}`}>
                <button
                  type="button"
                  onClick={() => addChip(item)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-[#D5DFC9] hover:bg-white/10"
                >
                  <span>{item.name}</span>
                  <span className="text-xs text-[#9FB08F]">{item.score ? `${item.score}% match` : item.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9FB08F]">Selected · {selected.length}/4</p>
            <ul className="flex flex-wrap gap-2" aria-label="Selected items; drag to reorder">
              {selected.map((item, index) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggedId(item.id)}
                  onDragEnd={() => setDraggedId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropChip(item.id)}
                  className="flex items-center gap-1 rounded-full border border-[#A9C97C]/30 bg-[#8FAF5A]/10 py-1 pl-3 pr-1 text-sm text-[#D5DFC9]"
                >
                  <span className="cursor-grab" title="Drag to reorder">{item.name}</span>
                  <button type="button" aria-label={`Move ${item.name} earlier`} onClick={() => moveChip(item.id, -1)} disabled={index === 0} className="rounded-full px-1.5 text-xs text-[#9FB08F] hover:bg-white/10 disabled:opacity-30">↑</button>
                  <button type="button" aria-label={`Move ${item.name} later`} onClick={() => moveChip(item.id, 1)} disabled={index === selected.length - 1} className="rounded-full px-1.5 text-xs text-[#9FB08F] hover:bg-white/10 disabled:opacity-30">↓</button>
                  <button type="button" aria-label={`Remove ${item.name}`} onClick={() => removeChip(item.id)} className="rounded-full px-2 text-[#E8967A] hover:bg-white/10">×</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {notice && <p role="status" className="mt-3 text-sm text-[#A9C97C]">{notice}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || selected.length < 2}
            className="rounded-xl bg-[#8FAF5A] px-5 py-3 text-sm font-semibold text-[#12200F] transition hover:bg-[#A9C97C] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? "Comparing…" : "Compare"}
          </button>
          {selected.length < 2 && <span className="text-xs text-[#9FB08F]">Add at least two items.</span>}
          {selected.length === 4 && <span className="text-xs text-[#E0B84A]">Maximum of four items reached.</span>}
        </div>
      </form>

      {error && <p role="alert" className="mb-4 rounded-xl border border-[#E8967A]/30 bg-[#E8967A]/10 px-4 py-3 text-sm text-[#F2B7A3]">{error}</p>}
      {result?.unresolved.map((entry) => (
        <div key={entry.unresolved} className="mb-3 rounded-xl border border-[#E0B84A]/25 bg-[#E0B84A]/[0.06] p-4">
          <p className="text-sm text-[#D8C58D]">Could not confidently match “{entry.unresolved}”. Did you mean:</p>
          {entry.suggestions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {entry.suggestions.filter((item) => item.kind === kind).map((item) => (
                <button key={item.slug} type="button" onClick={() => applySuggestion(entry.unresolved, item)} className="rounded-full border border-[#E0B84A]/30 px-3 py-1.5 text-xs text-[#E0B84A] hover:bg-[#E0B84A]/10">
                  {item.name}
                </button>
              ))}
            </div>
          ) : <p className="mt-2 text-xs text-[#9FB08F]">No close matches were found. Edit the name and try again.</p>}
        </div>
      ))}

      {result && result.items.length > 0 && (
        <div className="space-y-5">
          <div className="compare-hide-print flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-pressed={onlyDifferences} onClick={() => setOnlyDifferences((value) => !value)} className={`rounded-full border px-3 py-2 text-xs ${onlyDifferences ? "border-[#E0B84A]/40 bg-[#E0B84A]/10 text-[#E0B84A]" : "border-white/10 text-[#B7C4A9]"}`}>
                {onlyDifferences ? "Showing only differences" : "Show only differences"}
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void copyComparison()} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-[#C9D8B5] hover:bg-white/5">Copy as text</button>
              <button type="button" onClick={() => window.print()} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-[#C9D8B5] hover:bg-white/5">Print</button>
            </div>
          </div>

          <CompareTable items={result.items} rows={result.rows} onlyDifferences={onlyDifferences} />

          {result.references.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">Sources</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.references.map((reference) => (
                  <li key={`${reference.source_id}-${reference.item}-${reference.page ?? ""}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#B7C4A9]">
                    {reference.item}: {reference.title}{reference.page ? `, page ${reference.page}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-[#A9C97C]/20 bg-[#8FAF5A]/[0.06] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-xl font-semibold text-[#EAF2DD]">AI summary</h3>
              <button type="button" onClick={() => void requestSummary()} disabled={summaryLoading || result.unresolved.length > 0} className="compare-hide-print rounded-xl border border-[#A9C97C]/30 px-4 py-2 text-sm text-[#C9D8B5] hover:bg-[#8FAF5A]/10 disabled:opacity-40">
                {summaryLoading ? "Preparing summary…" : "Generate summary"}
              </button>
            </div>
            {summaryLoading && !summary && <p className="mt-3 text-sm text-[#9FB08F]">Writing a short summary from the stored profiles…</p>}
            {summary && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#D5DFC9]">{summary}</p>}
            {summarySafety && (
              <div className={`mt-4 rounded-xl border px-3 py-3 text-xs leading-5 ${summarySafety.level === "info" ? "border-white/10 bg-white/[0.03] text-[#9FB08F]" : "border-[#E0B84A]/25 bg-[#E0B84A]/[0.06] text-[#D8C58D]"}`}>
                {summarySafety.messages?.length > 0 && <ul className="mb-1 list-disc pl-4">{summarySafety.messages.map((message) => <li key={message}>{message}</li>)}</ul>}
                {summarySafety.disclaimer}
                {summarySafety.show_professional_cta && <span className="mt-1 block">Consult a qualified healthcare professional for personal advice.</span>}
              </div>
            )}
            <p className="mt-4 text-xs text-[#B7C4A9]">This is educational information, not advice on which to take.</p>
            {summaryReferences.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Summary sources">
                {summaryReferences.map((reference) => (
                  <li key={`${reference.source_id}-${reference.item}-${reference.page ?? ""}`} className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-[#9FB08F]">
                    {reference.item}: {reference.title}{reference.page ? `, p. ${reference.page}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
