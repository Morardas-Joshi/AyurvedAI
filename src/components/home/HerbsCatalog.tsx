import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type CatalogItem = {
  kind: "herb" | "medicine";
  slug: string;
  name: string;
  botanical_name?: string | null;
  form?: string;
  ingredients?: string[];
  summary?: string;
  citation?: string;
  score?: number;
};

const FORM_LABELS: Record<string, { name: string; explanation: string }> = {
  churna: { name: "Powder (churna)", explanation: "The reference glossary translates churna as powder." },
  kwatha: { name: "Decoction (kwatha)", explanation: "The reference glossary translates kwatha as decoction." },
  arishta: { name: "Fermented preparation (arishta)", explanation: "The reference glossary describes arishta as a fermented preparation." },
  ghrita: { name: "Medicated ghee (ghrita)", explanation: "The reference glossary translates ghrita as medicated ghee." },
  taila: { name: "Medicated oil (taila)", explanation: "The reference glossary translates taila as medicated oil." },
  guggulu: { name: "Guggulu formulation", explanation: "The cited passage names this formulation but does not explain its ingredients." },
  rasayana: { name: "Rasayana preparation", explanation: "The reference glossary describes rasayana as a rejuvenating therapy or tonic." },
};

type Profile = Record<string, unknown> & {
  references?: { source_id: string; title: string; page?: number | null }[];
  origins?: Record<string, string>;
};

type Detail = {
  kind: "herb" | "medicine";
  slug: string;
  name?: string;
  botanical_name?: string | null;
  form?: string;
  ingredients?: string[];
  profile: Profile;
  profile_note?: string | null;
  disclaimer?: string;
  safety_notes?: { category: string; severity: string; note: string }[];
  sources?: { id: number; title: string; license?: string | null; note?: string | null }[];
};

type RelatedItems = { items: { slug: string; name?: string; similarity: number }[]; message?: string | null };
type ComboItems = { items: { slug: string; confidence: number; n_formulations: number; label: string }[]; message?: string | null };

const PROFILE_LABELS: Record<string, string> = {
  rasa: "Taste",
  guna: "Plant qualities",
  virya: "Traditional heating or cooling effect",
  vipaka: "Traditional effect after digestion",
  prabhava: "Specific traditional action",
  dosha_effect: "Traditional descriptions of Vata, Pitta and Kapha",
  parts_used: "Plant parts mentioned",
  classical_uses: "Uses mentioned in the source",
  forms: "Preparations mentioned",
  precautions: "Precautions",
  contraindications: "Contraindications",
  interactions: "Interactions",
  traditional_dose_note: "Traditional dose note",
  habitat: "Habitat",
};

const PROFILE_HELP: Record<string, string> = {
  rasa: "Taste descriptions given in the reference.",
  guna: "Descriptions such as light, heavy, dry or oily, as stated in the reference.",
  virya: "The reference's traditional description of heating or cooling.",
  vipaka: "The reference's traditional description after digestion.",
  prabhava: "A specific traditional action stated in the reference.",
  dosha_effect: "The reference's description of Vata, Pitta or Kapha.",
  parts_used: "For example, root, leaf, seed or fruit.",
  classical_uses: "Traditional uses mentioned in the document. This reports what the source says; it does not prove an effect or recommend treatment.",
  forms: "Preparations named in the reference.",
  precautions: "Cautions stated in the cited reference.",
  contraindications: "Situations where the source advises avoiding the herb.",
  interactions: "Interactions with medicines or other substances stated in the source.",
  traditional_dose_note: "A source-only note about traditional dosage; it is not a dose recommendation.",
  habitat: "Where the source says the plant grows.",
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

function herbOverview(name: string, botanicalName: string | null | undefined, profile: Profile): string {
  const uses = displayValue(profile.classical_uses);
  const parts = displayValue(profile.parts_used);
  const details = [
    `${name}${botanicalName ? ` (${botanicalName})` : ""} is listed as an Ayurvedic herb.`,
    parts ? `The source identifies ${parts} as the plant parts used.` : "",
    uses ? `Traditional uses mentioned in the source: ${uses}.` : "",
  ].filter(Boolean);
  return details.length
    ? `${details.join(" ")} This describes the source, not a proven treatment.`
    : `The cited document mentions ${name}, but does not provide a clear description or specific uses.`;
}

export default function HerbsCatalog({ userKey }: { userKey: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [tab, setTab] = useState<"all" | "herb" | "medicine">("all");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [related, setRelated] = useState<RelatedItems | null>(null);
  const [combinations, setCombinations] = useState<ComboItems | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [combinationsLoading, setCombinationsLoading] = useState(false);
  const [relatedError, setRelatedError] = useState(false);
  const [combinationsError, setCombinationsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const openRequestId = useRef(0);

  function errorMessage(cause: unknown): string {
    if (cause instanceof TypeError) {
      return `Could not connect to the AyurvedAI service at ${API_BASE}. Check that the backend is running and that this page is using localhost or 127.0.0.1.`;
    }
    return cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
  }

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
    setSelectedItem(null);
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
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function openItem(item: CatalogItem) {
    const requestId = ++openRequestId.current;
    setLoading(true);
    setError("");
    setSelected(null);
    setSelectedItem(item);
    setRelated(null);
    setCombinations(null);
    setRelatedError(false);
    setCombinationsError(false);
    setRelatedLoading(item.kind === "herb");
    setCombinationsLoading(item.kind === "herb");
    let detailLoaded = false;
    try {
      const path = item.kind === "medicine"
        ? `/api/herbs/medicines/${encodeURIComponent(item.slug)}`
        : `/api/herbs/${encodeURIComponent(item.slug)}`;
      const detail = await request<Detail>(path);
      if (requestId !== openRequestId.current) return;
      setSelected(detail);
      detailLoaded = true;
      if (item.kind === "herb") {
        void Promise.allSettled([
          request<RelatedItems>(`/api/herbs/${encodeURIComponent(item.slug)}/related?limit=5`),
          request<ComboItems>(`/api/herbs/${encodeURIComponent(item.slug)}/combos`),
        ]).then(([relatedResult, comboResult]) => {
          if (requestId !== openRequestId.current) return;
          if (relatedResult.status === "fulfilled") setRelated(relatedResult.value);
          else setRelatedError(true);
          if (comboResult.status === "fulfilled") setCombinations(comboResult.value);
          else setCombinationsError(true);
          setRelatedLoading(false);
          setCombinationsLoading(false);
        });
      }
    } catch (cause) {
      if (requestId === openRequestId.current) setError(errorMessage(cause));
    } finally {
      if (requestId === openRequestId.current) {
        setLoading(false);
        if (item.kind !== "herb" || !detailLoaded) {
          setRelatedLoading(false);
          setCombinationsLoading(false);
        }
      }
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

  const hasProfileDetails = selected
    ? Boolean(selected.profile.references?.length)
      && Object.keys(PROFILE_LABELS).some((key) => Boolean(displayValue(selected.profile?.[key])))
    : false;
  const medicineSummary = selected?.kind === "medicine" ? displayValue(selected.profile?.summary) : "";
  const medicineForm = selected?.form ? FORM_LABELS[selected.form.toLowerCase()] : undefined;
  const herbOverviewText = selected?.kind === "herb"
    ? herbOverview(selected.name ?? selected.slug, selected.botanical_name, selected.profile)
    : "";
  const visibleItems = items.filter((item) => tab === "all" || item.kind === tab);

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
      {error && (
        <button
          type="button"
          onClick={() => selectedItem ? void openItem(selectedItem) : void loadCatalog(query)}
          className="mb-4 rounded-xl border border-[#E8967A]/30 px-4 py-2 text-sm font-medium text-[#F2B7A3] transition hover:bg-[#E8967A]/10"
        >
          Try again
        </button>
      )}
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
              {selected.botanical_name && selected.kind === "herb" && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-[#9FB08F]">Scientific name</p>
                  <p className="mt-0.5 text-xs text-[#8FA080]">The Latin name used to identify this plant.</p>
                  <p className="mt-1 text-sm italic text-[#C9D8B5]">{selected.botanical_name}</p>
                </div>
              )}
              {selected.form && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-[#9FB08F]">Preparation type</p>
                  <p className="mt-0.5 text-sm text-[#C9D8B5]">{medicineForm?.name ?? selected.form}</p>
                  {medicineForm && <p className="mt-0.5 text-xs leading-5 text-[#8FA080]">{medicineForm.explanation}</p>}
                </div>
              )}
              {selected.ingredients?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-[#9FB08F]">Listed ingredients</p>
                  <p className="mt-0.5 text-sm text-[#C9D8B5]">
                    {selected.ingredients.map((ingredient) =>
                      ingredient.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
                    ).join(", ")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {selected.kind === "herb" && (
              <button
                type="button"
                onClick={() => navigate(`/chat?herb=${encodeURIComponent(selected.name ?? selected.slug)}`)}
                className="rounded-xl bg-[#8FAF5A]/15 px-4 py-2 text-sm font-medium text-[#C9D8B5] transition hover:bg-[#8FAF5A]/25"
              >
                Ask about this herb
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(
                `/compare?kind=${selected.kind}&item=${encodeURIComponent(selected.slug)}&name=${encodeURIComponent(selected.name ?? selected.slug)}`,
              )}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-[#C9D8B5] transition hover:bg-white/5"
            >
              Compare {selected.kind === "herb" ? "herbs" : "medicines"}
            </button>
          </div>

          {selected.kind === "herb" && selected.profile.references?.length ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
              <h4 className="text-sm font-semibold text-[#D5DFC9]">About {selected.name ?? "this herb"}</h4>
              <p className="mt-1 text-sm leading-6 text-[#9FB08F]">
                {herbOverviewText}
              </p>
              <p className="mt-2 text-xs leading-5 text-[#8FA080]">
                This summary reports what the cited document says; it is not proof of an effect or personal treatment advice.
              </p>
            </div>
          ) : null}

          {selected.kind === "medicine" && (
            <div className="mt-5 rounded-2xl border border-[#A9C97C]/15 bg-[#8FAF5A]/[0.06] p-4">
              <h4 className="text-sm font-semibold text-[#D5DFC9]">About this medicine</h4>
              <p className="mt-1 text-sm leading-6 text-[#B7C4A9]">
                {medicineSummary || "The available reference does not provide a description for this medicine."}
              </p>
              <p className="mt-2 text-xs leading-5 text-[#8FA080]">
                This describes what the source says, not a recommendation to use the medicine. Ingredients appear only when listed in a cited source.
              </p>
            </div>
          )}

          {selected.kind === "herb" && !selected.profile.references?.length && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
              <h4 className="text-sm font-semibold text-[#D5DFC9]">No source information found</h4>
              <p className="mt-1 text-sm leading-6 text-[#9FB08F]">
                No matching information about {selected.name ?? "this herb"} was found in the available reference documents.
              </p>
            </div>
          )}

          {hasProfileDetails && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-[#D5DFC9]">More details from the source</h4>
            </div>
          )}
          {hasProfileDetails && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {Object.entries(PROFILE_LABELS).map(([key, label]) => {
                const value = displayValue(selected.profile?.[key]);
                if (!value) return null;
                return (
                  <div key={key} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">{label}</h4>
                    <p className="mt-1 text-xs leading-5 text-[#8FA080]">{PROFILE_HELP[key]}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#D5DFC9]">{value}</p>
                  </div>
                );
              })}
            </div>
          )}

          {selected.profile?.references?.length ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
              <h4 className="text-sm font-semibold text-[#D5DFC9]">Sources</h4>
              <p className="mt-1 text-xs leading-5 text-[#8FA080]">Exact document pages used for these details.</p>
              <ul className="mt-3 space-y-2 text-sm text-[#B7C4A9]">
                {selected.profile.references.map((reference) => (
                  <li key={`${reference.source_id}-${reference.page ?? ""}`} className="rounded-lg bg-white/[0.04] px-3 py-2">
                    <span className="block">{reference.title}</span>
                    {reference.page && <span className="mt-0.5 block text-xs text-[#8FA080]">Page {reference.page}</span>}
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
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">Sources</h4>
              <ul className="mt-2 space-y-1 text-sm text-[#B7C4A9]">
                {selected.sources.map((source) => (
                  <li key={source.id}>
                    <span>{source.title}{source.license ? ` · ${source.license}` : ""}</span>
                    {source.note && <span className="mt-1 block text-xs leading-5 text-[#8FA080]">{source.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {selected.kind === "herb" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">Related herbs</h4>
                {related?.items.length ? (
                  <ul className="mt-2 space-y-2">
                    {related.items.map((item) => (
                      <li key={item.slug}>
                        <button
                          type="button"
                          onClick={() => void openItem({ kind: "herb", slug: item.slug, name: item.name ?? item.slug })}
                          className="w-full rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-left text-sm text-[#B7C4A9] transition hover:border-[#A9C97C]/30 hover:text-[#EAF2DD]"
                        >
                          {item.name ?? item.slug}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-[#9FB08F]">
                    {relatedLoading
                      ? "Checking for related herbs…"
                      : relatedError
                        ? "Could not load related herbs."
                        : related?.message
                          ? "There is not enough sourced information to suggest related herbs yet."
                          : "No related herbs found in the available sources yet."}
                  </p>
                )}
                {relatedError && selectedItem && (
                  <button
                    type="button"
                    onClick={() => void openItem(selectedItem)}
                    className="mt-2 text-xs font-medium text-[#A9C97C] hover:text-[#EAF2DD]"
                  >
                    Retry
                  </button>
                )}
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">Formulation patterns</h4>
                {combinations?.items.length ? (
                  <ul className="mt-2 space-y-2">
                    {combinations.items.map((item) => (
                      <li key={item.slug} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm leading-6 text-[#B7C4A9]">
                        Often used with <span className="font-medium capitalize text-[#D5DFC9]">{item.slug.replaceAll("-", " ")}</span>
                        <span className="block text-xs text-[#8FA080]">
                          Seen in {item.n_formulations} formulations · {item.confidence}% confidence
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-[#9FB08F]">
                    {combinationsLoading
                      ? "Checking formulation records…"
                      : combinationsError
                        ? "Could not load formulation information."
                        : combinations?.message?.includes("Not enough")
                          ? "There are not enough approved formulation records to show patterns yet."
                          : "No formulation patterns found in the available records yet."}
                  </p>
                )}
                {combinationsError && selectedItem && (
                  <button
                    type="button"
                    onClick={() => void openItem(selectedItem)}
                    className="mt-2 text-xs font-medium text-[#A9C97C] hover:text-[#EAF2DD]"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}
          {selected.disclaimer && <p className="mt-5 text-xs leading-5 text-[#9FB08F]">{selected.disclaimer}</p>}
        </article>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((item) => (
          <button
            key={`${item.kind}-${item.slug}`}
            type="button"
            onClick={() => void openItem(item)}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-[#A9C97C]/40 hover:bg-white/[0.07]"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8FAF5A]">{item.kind}</span>
            <span className="mt-1 block font-medium capitalize text-[#EAF2DD]">{item.name}</span>
            {item.botanical_name && <span className="mt-1 block text-xs italic text-[#9FB08F]">{item.botanical_name}</span>}
            {item.form && (
              <span className="mt-2 block text-xs text-[#B7C4A9]">
                {FORM_LABELS[item.form.toLowerCase()]?.name ?? item.form}
              </span>
            )}
            {item.ingredients?.length ? (
              <span className="mt-1 block text-xs text-[#9FB08F]">
                Ingredients: {item.ingredients.map((ingredient) =>
                  ingredient.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
                ).join(", ")}
              </span>
            ) : null}
            {item.summary && <span className="mt-2 line-clamp-3 text-xs leading-5 text-[#9FB08F]">{item.summary}</span>}
            {item.citation && <span className="mt-2 block text-[10px] text-[#8FA080]">Source: {item.citation}</span>}
          </button>
        ))}
      </div>
      {!loading && !error && visibleItems.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-[#9FB08F]">
          No matching entries found. Try another spelling or search term.
        </p>
      )}
    </section>
  );
}
