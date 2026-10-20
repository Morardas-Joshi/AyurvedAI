import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type CatalogItem = {
  kind: "herb" | "medicine";
  slug: string;
  name: string;
  botanical_name?: string | null;
  status?: string;
  score?: number;
};

type Profile = Record<string, unknown> & {
  references?: { source_id: string; title: string; page?: number | null }[];
  origins?: Record<string, string>;
};

type Detail = {
  kind: "herb" | "medicine";
  slug: string;
  name?: string;
  form?: string;
  ingredients?: string[];
  status: string;
  draft_label?: string | null;
  profile: Profile;
  profile_note?: string | null;
  disclaimer?: string;
  safety_notes?: { category: string; severity: string; note: string }[];
  sources?: { id: number; title: string; license?: string | null; note?: string | null }[];
};

type RelatedItems = { items: { slug: string; name?: string; similarity: number }[]; message?: string | null };
type ComboItems = { items: { slug: string; confidence: number; n_formulations: number; label: string }[]; message?: string | null };

const PROFILE_LABELS: Record<string, string> = {
  rasa: "Taste (Rasa)",
  guna: "Qualities (Guna)",
  virya: "Potency (Virya)",
  vipaka: "Post-digestive effect (Vipaka)",
  prabhava: "Specific action (Prabhava)",
  dosha_effect: "Dosha effects",
  parts_used: "Parts used",
  classical_uses: "Classical uses",
  forms: "Traditional forms",
  precautions: "Precautions",
  contraindications: "Contraindications",
  interactions: "Interactions",
  traditional_dose_note: "Traditional dose note",
  habitat: "Habitat",
};

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join(" · ");
  }
  return typeof value === "string" ? value : "";
}

export default function HerbsCatalog({ userKey }: { userKey: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [tab, setTab] = useState<"all" | "herb" | "medicine">("all");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [related, setRelated] = useState<RelatedItems | null>(null);
  const [combinations, setCombinations] = useState<ComboItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function request<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "X-User-Id": userKey },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.detail ?? `Request failed (${response.status})`);
    return data as T;
  }

  async function loadCatalog(search: string, selectedTab = tab) {
    setLoading(true);
    setError("");
    setSelected(null);
    try {
      if (search.trim()) {
        const data = await request<{ results: CatalogItem[] }>(
          `/api/herbs/search?q=${encodeURIComponent(search.trim())}&limit=50`,
        );
        setItems(data.results.filter((item) => selectedTab === "all" || item.kind === selectedTab));
      } else if (selectedTab === "medicine") {
        const data = await request<{ results: CatalogItem[] }>("/api/herbs/medicines?limit=50");
        setItems(data.results);
      } else {
        const [herbs, medicines] = await Promise.all([
          request<{ items: CatalogItem[]; total: number }>("/api/herbs/browse?page_size=60"),
          selectedTab === "all"
            ? request<{ results: CatalogItem[] }>("/api/herbs/medicines?limit=50")
            : Promise.resolve({ results: [] }),
        ]);
        const pages = await Promise.all(
          Array.from({ length: Math.max(0, Math.ceil(herbs.total / 60) - 1) }, (_, index) =>
            request<{ items: CatalogItem[] }>(`/api/herbs/browse?page=${index + 2}&page_size=60`),
          ),
        );
        setItems([...herbs.items, ...pages.flatMap((page) => page.items), ...medicines.results]);
      }
    } catch (cause) {
      setItems([]);
      setError(cause instanceof TypeError ? "Cannot reach the server. Please check that the backend is running." : (cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function openItem(item: CatalogItem) {
    setLoading(true);
    setError("");
    setRelated(null);
    setCombinations(null);
    try {
      const path = item.kind === "medicine"
        ? `/api/herbs/medicines/${encodeURIComponent(item.slug)}`
        : `/api/herbs/${encodeURIComponent(item.slug)}`;
      setSelected(await request<Detail>(path));
      if (item.kind === "herb") {
        const [relatedData, comboData] = await Promise.all([
          request<RelatedItems>(`/api/herbs/${encodeURIComponent(item.slug)}/related?limit=5`),
          request<ComboItems>(`/api/herbs/${encodeURIComponent(item.slug)}/combos`),
        ]);
        setRelated(relatedData);
        setCombinations(comboData);
      }
    } catch (cause) {
      setError(cause instanceof TypeError ? "Cannot reach the server. Please check that the backend is running." : (cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCatalog(searchParams.get("q") ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
    // Fetch once for the initial route, including Identify-result search parameters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCatalog(query);
  }

  function selectTab(nextTab: "all" | "herb" | "medicine") {
    setTab(nextTab);
    void loadCatalog(query, nextTab);
  }

  return (
    <section className="mx-auto w-full max-w-[1000px] pb-12">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A9C97C]">Reference library</p>
        <h2 className="font-display mt-2 text-3xl font-semibold text-[#EAF2DD]">Herbs &amp; Medicines</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#B7C4A9]">
          Browse Ayurvedic herbs and formulations. Profile facts are shown only when supported by reference documents.
        </p>
      </div>

      <form onSubmit={submitSearch} className="mb-4 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by herb or medicine name"
          aria-label="Search herbs and medicines"
          className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-[#EAF2DD] outline-none placeholder:text-[#81917A] focus:border-[#A9C97C]/70"
        />
        <button type="submit" className="rounded-2xl bg-[#8FAF5A] px-5 py-3 text-sm font-semibold text-[#12200F] hover:bg-[#A9C97C]">
          Search
        </button>
      </form>

      <div className="mb-5 flex gap-2" role="tablist" aria-label="Catalog type">
        {(["all", "herb", "medicine"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => selectTab(value)}
            className={`rounded-full border px-4 py-2 text-xs font-medium capitalize ${
              tab === value ? "border-[#A9C97C]/60 bg-[#8FAF5A]/15 text-[#C9D8B5]" : "border-white/10 text-[#9FB08F] hover:bg-white/5"
            }`}
          >
            {value === "all" ? "All" : `${value}s`}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-[#E8967A]/30 bg-[#E8967A]/10 px-4 py-3 text-sm text-[#F2B7A3]">{error}</p>}
      {loading && <p className="mb-4 text-sm text-[#9FB08F]">Loading reference information…</p>}

      {selected && (
        <article className="mb-6 rounded-3xl border border-white/15 bg-white/[0.05] p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A9C97C]">
                {selected.kind === "herb" ? "Herb profile" : "Medicine profile"}
              </p>
              <h3 className="font-display mt-1 text-2xl font-semibold text-[#EAF2DD]">
                {selected.name ?? selected.slug.replaceAll("-", " ")}
              </h3>
              {selected.form && <p className="mt-1 text-sm text-[#B7C4A9]">Form: {selected.form}</p>}
              {selected.ingredients?.length ? (
                <p className="mt-1 text-sm text-[#B7C4A9]">Ingredients: {selected.ingredients.join(", ")}</p>
              ) : null}
            </div>
            <span className="rounded-full border border-[#E0B84A]/30 bg-[#E0B84A]/10 px-3 py-1 text-xs text-[#E0B84A]">
              {selected.draft_label ?? (selected.status === "approved" ? "Reviewed" : "Draft, not yet reviewed")}
            </span>
          </div>

          {selected.kind === "herb" && (
            <button
              type="button"
              onClick={() => navigate(`/chat?herb=${encodeURIComponent(selected.name ?? selected.slug)}`)}
              className="mt-4 rounded-xl border border-[#A9C97C]/30 px-4 py-2 text-sm text-[#C9D8B5] hover:bg-[#8FAF5A]/10"
            >
              Ask about this herb in chat
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(
              `/compare?kind=${selected.kind}&item=${encodeURIComponent(selected.slug)}&name=${encodeURIComponent(selected.name ?? selected.slug)}`,
            )}
            className="ml-2 mt-4 rounded-xl border border-[#A9C97C]/30 px-4 py-2 text-sm text-[#C9D8B5] hover:bg-[#8FAF5A]/10"
          >
            Compare with other {selected.kind === "herb" ? "herbs" : "medicines"}
          </button>

          {selected.profile_note && (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm leading-6 text-[#B7C4A9]">
              {selected.profile_note}
            </p>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {Object.entries(PROFILE_LABELS).map(([key, label]) => {
              const value = displayValue(selected.profile?.[key]);
              if (!value) return null;
              return (
                <div key={key} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">{label}</h4>
                    {selected.profile.origins?.[key] && (
                      <span className="text-[10px] text-[#9FB08F]">From {selected.profile.origins[key]}</span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#D5DFC9]">{value}</p>
                </div>
              );
            })}
          </div>

          {selected.profile?.references?.length ? (
            <div className="mt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">Profile references</h4>
              <ul className="mt-2 space-y-1 text-sm text-[#B7C4A9]">
                {selected.profile.references.map((reference) => (
                  <li key={`${reference.source_id}-${reference.page ?? ""}`}>
                    {reference.title}{reference.page ? `, page ${reference.page}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selected.safety_notes?.length ? (
            <div className="mt-5 rounded-2xl border border-[#E0B84A]/25 bg-[#E0B84A]/[0.06] p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#E0B84A]">Safety notes</h4>
              {selected.safety_notes.map((note, index) => (
                <p key={`${note.category}-${index}`} className="mt-2 text-sm leading-6 text-[#D8C58D]">{note.note}</p>
              ))}
            </div>
          ) : null}

          {selected.sources?.length ? (
            <div className="mt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">Catalog sources</h4>
              <ul className="mt-2 space-y-1 text-sm text-[#B7C4A9]">
                {selected.sources.map((source) => <li key={source.id}>{source.title}{source.license ? ` · ${source.license}` : ""}</li>)}
              </ul>
            </div>
          ) : null}
          {selected.kind === "herb" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">Related herbs</h4>
                {related?.items.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-[#B7C4A9]">
                    {related.items.map((item) => (
                      <li key={item.slug}>
                        <button
                          type="button"
                          onClick={() => void openItem({ kind: "herb", slug: item.slug, name: item.name ?? item.slug })}
                          className="text-left hover:text-[#A9C97C]"
                        >
                          {item.name ?? item.slug}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-sm text-[#9FB08F]">{related?.message ?? "Loading related herbs…"}</p>}
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">Formulation patterns</h4>
                {combinations?.items.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-[#B7C4A9]">
                    {combinations.items.map((item) => (
                      <li key={item.slug}>{item.slug.replaceAll("-", " ")} · {item.confidence}% confidence in {item.n_formulations} formulations</li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-sm text-[#9FB08F]">{combinations?.message ?? "Loading formulation patterns…"}</p>}
              </div>
            </div>
          )}
          {selected.disclaimer && <p className="mt-5 text-xs leading-5 text-[#9FB08F]">{selected.disclaimer}</p>}
        </article>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <button
            key={`${item.kind}-${item.slug}`}
            type="button"
            onClick={() => void openItem(item)}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-[#A9C97C]/40 hover:bg-white/[0.07]"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8FAF5A]">{item.kind}</span>
            <span className="mt-1 block font-medium capitalize text-[#EAF2DD]">{item.name}</span>
            {item.botanical_name && <span className="mt-1 block text-xs italic text-[#9FB08F]">{item.botanical_name}</span>}
            {item.status && item.status !== "approved" && <span className="mt-2 inline-block text-[10px] text-[#E0B84A]">Draft, not yet reviewed</span>}
          </button>
        ))}
      </div>
      {!loading && !error && items.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-[#9FB08F]">
          No matching entries found. Try another spelling or search term.
        </p>
      )}
    </section>
  );
}
