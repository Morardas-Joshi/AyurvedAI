import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const TABS = ["Constitution", "Diet", "Daily routine", "Seasonal guide"] as const;
type Tab = (typeof TABS)[number];
type Question = { id: number; text: string; options: { label: string; weights: Record<string, number> }[] };
type Prakriti = { percentages: Record<string, number>; dominant: string[]; confidence: string; disclaimer?: string };
type Source = { title: string; page?: number; snippet?: string; url?: string };
type Season = { id: number; name: string; months: number[]; description: string; food_notes: string; routine_notes: string; source_ids: Source[]; general_knowledge: boolean; status?: string; note_error?: string };
type Food = { id: number; food: string; category: string; description: string; reason: string; rasa?: string[]; caution_note?: string | null; source_ids: Source[]; source_label: string; status: string };
type Routine = { id: number; slot: string; title: string; description: string; reason: string; source_ids: Source[]; source_label: string; status: string };
type Plan = { favour: Food[]; limit: Food[]; routine: Routine[]; season: string; dominant: string[]; season_guide?: Season; incompatible_removed?: string[]; incompatibility_notes?: string[]; references: (Source & { id: number; kind?: string; trust?: string })[] };
type Safety = { level: string; flags?: string[]; messages?: string[]; disclaimer?: string; show_professional_cta?: boolean };
type CachedLifestyle = { owner: string; tab: Tab; questions: Question[]; answers: Record<string, number>; index: number; prakriti: Prakriti | null; season: Season | null; selectedSeason: string; dietTags: string[]; avoid: string; goal: string; goalDetails: string; healthContext: string; plan: Plan | null; safety: Safety | null; explanation: string; expanded: string | null };
let pageCache: CachedLifestyle | null = null;

function errorMessage(error: unknown): string {
  return error instanceof TypeError ? "Cannot reach the server. Check that the backend is running." : error instanceof Error ? error.message : "Something went wrong.";
}

async function api<T>(path: string, userKey: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "X-User-Id": userKey, ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.detail ?? `Request failed (${response.status})`);
  return body as T;
}

async function readPlanStream(response: Response, onExplanation: (text: string) => void): Promise<{ plan: Plan | null; safety: Safety; references: Plan["references"]; streamError: string }> {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Plan request failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let plan: Plan | null = null;
  let safety: Safety = { level: "info" };
  let references: Plan["references"] = [];
  let streamError = "";
  const consume = (event: string) => {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      if (data.type === "meta") {
        plan = (data.plan as Plan | null) ?? null;
        safety = (data.safety as Safety) ?? {};
        references = (data.references as Plan["references"]) ?? [];
      } else if (data.type === "delta" && typeof data.text === "string") {
        onExplanation(data.text);
      } else if (data.type === "error") {
        streamError = typeof data.message === "string" ? data.message : "The plan explanation could not be completed.";
      } else if (data.type === "safety" && data.safety) {
        safety = data.safety as Safety;
      } else if (data.type === "done" && data.safety) {
        safety = data.safety as Safety;
      }
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    events.forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  return { plan, safety, references, streamError };
}

function FoodList({ title, items, empty, expanded, onExpand }: { title: string; items: Food[]; empty: string; expanded: string | null; onExpand: (id: string | null) => void }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
      <h3 className="font-display text-xl font-semibold text-[#EAF2DD]">{title}</h3>
      {items.length === 0 ? <p className="mt-3 text-sm text-[#9FB08F]">{empty}</p> : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const id = `${title}-${item.id}`;
            return (
              <li key={id}>
                <button type="button" aria-expanded={expanded === id} onClick={() => onExpand(expanded === id ? null : id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-3 text-left hover:bg-white/5">
                  <span className="font-medium text-[#D5DFC9]">{item.food}</span>
                  <span className="text-[10px] text-[#A9C97C]">{item.source_ids.length ? item.source_label === "document" ? item.source_ids[0]?.title : item.source_label : "General knowledge"}{item.status === "draft" ? " · Draft" : ""}</span>
                </button>
                {expanded === id && <div className="rounded-b-xl bg-black/10 px-3 py-3 text-sm leading-6 text-[#B7C4A9]"><p>{item.description}</p>{item.rasa?.length ? <p className="mt-1 text-xs text-[#B7C4A9]">Taste (rasa): {item.rasa.join(", ")}</p> : null}<p className="mt-1 text-xs text-[#9FB08F]">{item.reason}</p>{item.source_ids[0]?.url && <a href={item.source_ids[0].url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-[#A9C97C] underline">{item.source_ids[0].title} · Open source</a>}{item.caution_note && <p className="mt-2 text-[#E0C985]">Caution: {item.caution_note}</p>}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function LifestylePage({ userKey }: { userKey: string }) {
  const navigate = useNavigate();
  const initial = pageCache?.owner === userKey ? pageCache : null;
  const [tab, setTab] = useState<Tab>(initial?.tab ?? TABS[0]);
  const [questions, setQuestions] = useState<Question[]>(initial?.questions ?? []);
  const [answers, setAnswers] = useState<Record<string, number>>(initial?.answers ?? {});
  const [index, setIndex] = useState(initial?.index ?? 0);
  const [prakriti, setPrakriti] = useState<Prakriti | null>(initial?.prakriti ?? null);
  const [season, setSeason] = useState<Season | null>(initial?.season ?? null);
  const [selectedSeason, setSelectedSeason] = useState(initial?.selectedSeason ?? "");
  const [dietTags, setDietTags] = useState<string[]>(initial?.dietTags ?? []);
  const [avoid, setAvoid] = useState(initial?.avoid ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "general_wellness");
  const [goalDetails, setGoalDetails] = useState(initial?.goalDetails ?? "");
  const [healthContext, setHealthContext] = useState(initial?.healthContext ?? "");
  const [plan, setPlan] = useState<Plan | null>(initial?.plan ?? null);
  const [safety, setSafety] = useState<Safety | null>(initial?.safety ?? null);
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [expanded, setExpanded] = useState<string | null>(initial?.expanded ?? null);
  const [routineExpanded, setRoutineExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [avoidDraft, setAvoidDraft] = useState("");

  useEffect(() => {
    pageCache = { owner: userKey, tab, questions, answers, index, prakriti, season, selectedSeason, dietTags, avoid, goal, goalDetails, healthContext, plan, safety, explanation, expanded };
  }, [userKey, tab, questions, answers, index, prakriti, season, selectedSeason, dietTags, avoid, goal, goalDetails, healthContext, plan, safety, explanation, expanded]);

  useEffect(() => {
    if (!questions.length) {
      void api<{ questions: Question[] }>("/api/lifestyle/questions", userKey)
        .then((data) => setQuestions(data.questions))
        .catch((cause: unknown) => setError(errorMessage(cause)));
    }
    if (!season) {
      void api<Season>("/api/lifestyle/season", userKey)
        .then((data) => {
          setSeason(data);
          setSelectedSeason(data.name);
        })
        .catch((cause: unknown) => setError(errorMessage(cause)));
    }
  }, [userKey, questions.length, season]);

  const currentQuestion = questions[index];
  const complete = useMemo(() => questions.length > 0 && questions.every((question) => answers[String(question.id)] !== undefined), [questions, answers]);
  const avoidList = useMemo(() => avoid.split(",").map((item) => item.trim()).filter(Boolean), [avoid]);
  const disclaimer = prakriti?.disclaimer ?? "A self-assessment for learning. It is not a diagnosis. A qualified Ayurvedic practitioner assesses constitution properly.";

  async function calculatePrakriti() {
    setBusy(true);
    setError("");
    try {
      const result = await api<Prakriti>("/api/lifestyle/prakriti", userKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      setPrakriti(result);
      setNotice("Your learning self-assessment is ready.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function changeSeason(name: string) {
    setSelectedSeason(name);
    setPlan(null);
    setExplanation("");
    setError("");
    try {
      setSeason(await api<Season>(`/api/lifestyle/season?override=${encodeURIComponent(name)}`, userKey));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function buildPlan() {
    if (!prakriti) {
      setError("Complete the constitution self-assessment first.");
      setTab("Constitution");
      return;
    }
    if (!selectedSeason) {
      setError("Choose a season before building a plan.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setPlan(null);
    setSafety(null);
    setExplanation("");
    try {
      const response = await fetch(`${API_BASE}/api/lifestyle/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userKey },
        body: JSON.stringify({
          prakriti,
          season: selectedSeason,
          diet_tags: dietTags,
          avoid: avoidList,
          goal,
          goal_details: goalDetails,
          health_context: healthContext,
        }),
      });
      const result = await readPlanStream(response, (text) => setExplanation((current) => current + text));
      setPlan(result.plan);
      setSafety(result.safety);
      if (result.streamError) setError(result.streamError);
      if (!result.plan) setNotice("No personalized plan was created. Review the caution message below.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    if (!plan || !prakriti) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: number }>("/api/lifestyle/plans", userKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prakriti,
          season: plan.season,
          preferences: { diet_tags: dietTags, avoid: avoidList, goal },
          plan,
        }),
      });
      setNotice(`Plan saved to your account (plan ${result.id}).`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function toggleTag(tag: string) {
    setDietTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]);
    setPlan(null);
  }

  const contextText = plan
    ? `I am reviewing a general Ayurvedic diet and lifestyle plan for ${plan.dominant.join(" and ")} during ${plan.season}. Please explain only the source-backed items in the plan, without recommending herbs, supplements, doses, or medical treatment.`
    : "I have a general Ayurvedic diet and lifestyle question. Please give safe educational information and use my reference documents.";

  return (
    <section className="mx-auto w-full max-w-[1100px] pb-12">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A9C97C]">Food · Daily rhythm · Seasons</p>
        <h2 className="font-display mt-2 text-3xl font-semibold text-[#EAF2DD]">Diet &amp; Lifestyle</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#B7C4A9]">Explore educational guidance grounded in your reference documents. This page does not diagnose or prescribe.</p>
      </div>

      <div role="tablist" aria-label="Lifestyle sections" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`shrink-0 rounded-full border px-4 py-2 text-sm ${tab === item ? "border-[#A9C97C]/50 bg-[#8FAF5A]/15 text-[#D5DFC9]" : "border-white/10 text-[#9FB08F] hover:bg-white/5"}`}>{item}</button>)}
      </div>

      {(safety?.messages?.length || safety?.level === "warning") && (
        <div role="status" className="mb-4 rounded-xl border border-[#E0B84A]/30 bg-[#E0B84A]/10 p-4 text-sm text-[#E6D49A]">
          {safety.messages?.length ? <ul className="list-disc space-y-1 pl-5">{safety.messages.map((message) => <li key={message}>{message}</li>)}</ul> : "Please check with a qualified health professional before making personal changes."}
          {safety.show_professional_cta && <p className="mt-2">Ask your doctor or a qualified Ayurvedic practitioner.</p>}
        </div>
      )}
      {error && <p role="alert" className="mb-4 rounded-xl border border-[#E8967A]/30 bg-[#E8967A]/10 px-4 py-3 text-sm text-[#F2B7A3]">{error}</p>}
      {notice && <p role="status" className="mb-4 text-sm text-[#A9C97C]">{notice}</p>}

      {tab === "Constitution" && (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h3 className="font-display text-xl font-semibold text-[#EAF2DD]">Know your constitution</h3><p className="mt-1 text-xs text-[#9FB08F]">10 questions · about 2–3 minutes</p></div>
              <span className="text-xs text-[#A9C97C]">{questions.length ? Math.round((Object.keys(answers).length / questions.length) * 100) : 0}%</span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#A9C97C] transition-all" style={{ width: `${questions.length ? (Object.keys(answers).length / questions.length) * 100 : 0}%` }} /></div>
            {!currentQuestion ? <p className="text-sm text-[#9FB08F]">Loading questionnaire…</p> : (
              <>
                <p className="text-xs text-[#9FB08F]">Question {index + 1} of {questions.length}</p>
                <h4 className="mt-2 text-lg font-medium text-[#EAF2DD]">{currentQuestion.text}</h4>
                <div className="mt-4 grid gap-2">
                  {currentQuestion.options.map((option, optionIndex) => <button key={option.label} type="button" aria-pressed={answers[String(currentQuestion.id)] === optionIndex} onClick={() => setAnswers((current) => ({ ...current, [String(currentQuestion.id)]: optionIndex }))} className={`rounded-xl border px-4 py-3 text-left text-sm ${answers[String(currentQuestion.id)] === optionIndex ? "border-[#A9C97C]/60 bg-[#8FAF5A]/15 text-[#EAF2DD]" : "border-white/10 text-[#B7C4A9] hover:bg-white/5"}`}>{option.label}</button>)}
                </div>
                <div className="mt-5 flex justify-between gap-2">
                  <button type="button" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-[#B7C4A9] disabled:opacity-40">Back</button>
                  {index < questions.length - 1 ? <button type="button" onClick={() => { if (answers[String(currentQuestion.id)] === undefined) { setError("Choose an answer to continue."); return; } setError(""); setIndex((current) => Math.min(questions.length - 1, current + 1)); }} className="rounded-xl bg-[#8FAF5A] px-4 py-2 text-sm font-semibold text-[#12200F]">Next</button> : <button type="button" onClick={() => void calculatePrakriti()} disabled={!complete || busy} className="rounded-xl bg-[#8FAF5A] px-4 py-2 text-sm font-semibold text-[#12200F] disabled:opacity-40">{busy ? "Calculating…" : "See my learning result"}</button>}
                </div>
              </>
            )}
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <h3 className="font-display text-xl font-semibold text-[#EAF2DD]">Your self-assessment</h3>
            {prakriti ? <div className="mt-4 space-y-4">
              {(["vata", "pitta", "kapha"] as const).map((dosha) => <div key={dosha}><div className="mb-1 flex justify-between text-sm capitalize text-[#D5DFC9]"><span>{dosha}</span><span>{prakriti.percentages[dosha]}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#A9C97C]" style={{ width: `${prakriti.percentages[dosha]}%` }} /></div></div>)}
              <p className="text-sm text-[#B7C4A9]">Highest pattern: <strong className="capitalize text-[#D5DFC9]">{prakriti.dominant.join(" + ")}</strong>. {prakriti.confidence}</p>
            </div> : <p className="mt-3 text-sm leading-6 text-[#9FB08F]">Answer the questionnaire to see a transparent weighted-score split.</p>}
            <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-[#9FB08F]">{disclaimer}</p>
          </section>
        </div>
      )}

      {tab === "Diet" && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <h3 className="font-display text-xl font-semibold text-[#EAF2DD]">Diet preferences</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {[["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["jain", "Jain"], ["eggs_ok", "Eggs OK"]].map(([tag, label]) => <button key={tag} type="button" aria-pressed={dietTags.includes(tag)} onClick={() => toggleTag(tag)} className={`rounded-full border px-3 py-1.5 text-xs ${dietTags.includes(tag) ? "border-[#A9C97C]/50 bg-[#8FAF5A]/15 text-[#D5DFC9]" : "border-white/10 text-[#9FB08F]"}`}>{label}</button>)}
            </div>
            <label className="mt-4 block text-sm text-[#D5DFC9]" htmlFor="lifestyle-avoid">Foods to avoid (comma-separated)</label>
            <input id="lifestyle-avoid" value={avoidDraft} onChange={(event) => setAvoidDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setAvoid((current) => [...new Set([...current.split(",").map((x) => x.trim()).filter(Boolean), avoidDraft.trim()].filter(Boolean))].join(", ")); setAvoidDraft(""); setPlan(null); } }} placeholder="e.g. peanuts, sesame" className="mt-2 w-full rounded-xl border border-white/15 bg-black/15 px-4 py-3 text-sm text-[#EAF2DD] placeholder:text-[#81917A]" />
            {avoid && <div className="mt-2 flex flex-wrap gap-2">{avoidList.map((item) => <button key={item} type="button" onClick={() => setAvoid(avoidList.filter((value) => value !== item).join(", "))} className="rounded-full border border-[#E8967A]/25 px-3 py-1 text-xs text-[#E8B3A2]" aria-label={`Remove ${item} from foods to avoid`}>{item} ×</button>)}</div>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-[#D5DFC9]">Goal
                <select value={goal} onChange={(event) => setGoal(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-[#102117] px-3 py-3 text-sm text-[#EAF2DD]">
                  <option value="general_wellness">General wellness</option><option value="digestion_habits">Digestion habits</option><option value="sleep_habits">Sleep habits</option><option value="stress_balance">Stress balance</option>
                </select>
              </label>
              <label className="text-sm text-[#D5DFC9]">Health considerations (optional)
                <input value={healthContext} onChange={(event) => setHealthContext(event.target.value)} maxLength={500} placeholder="e.g. diabetes, pregnancy, medicines" className="mt-2 w-full rounded-xl border border-white/15 bg-black/15 px-3 py-3 text-sm text-[#EAF2DD]" />
              </label>
            </div>
            <label className="mt-4 block text-sm text-[#D5DFC9]" htmlFor="lifestyle-goal-details">Anything else about your goal? Avoid including details you do not want to share.
              <input id="lifestyle-goal-details" value={goalDetails} onChange={(event) => setGoalDetails(event.target.value)} maxLength={500} placeholder="Optional; unsafe or medical goals will not produce a plan" className="mt-2 w-full rounded-xl border border-white/15 bg-black/15 px-3 py-3 text-sm text-[#EAF2DD]" />
            </label>
          </section>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void buildPlan()} disabled={busy} className="rounded-xl bg-[#8FAF5A] px-5 py-3 text-sm font-semibold text-[#12200F] disabled:opacity-45">{busy ? "Building…" : "Build educational plan"}</button>
            <button type="button" onClick={() => navigate(`/chat?context=${encodeURIComponent(contextText)}`)} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-[#D5DFC9]">Ask a follow-up question</button>
            <button type="button" onClick={() => window.print()} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-[#D5DFC9]">Print</button>
          </div>
          {plan && <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-sm text-[#D5DFC9]">Learning profile: <strong className="capitalize">{plan.dominant.join(" + ")}</strong> · Selected season: {plan.season}</p><button type="button" onClick={() => void savePlan()} disabled={busy} className="rounded-lg border border-[#A9C97C]/40 px-3 py-2 text-xs text-[#D5DFC9] disabled:opacity-40">Save my plan</button></div>
            <p className="text-xs text-[#9FB08F]">The general food and routine ideas below come from cited public-health sources; they are not tailored to your dosha, season, or a medical condition. Any additional items extracted from your documents are identified separately and may be unreviewed drafts.</p>
            {explanation && <p className="rounded-xl border border-white/10 p-4 text-sm leading-6 text-[#D5DFC9]">{explanation}</p>}
            {(plan.incompatible_removed?.length || plan.incompatibility_notes?.length) ? <div className="rounded-xl border border-[#E0B84A]/25 bg-[#E0B84A]/[0.06] p-4 text-sm text-[#E6D49A]"><p>Food-combination caution: conflicting items were removed from the selection.</p>{plan.incompatibility_notes?.map((note) => <p key={note} className="mt-1">{note}</p>)}</div> : null}
            <div className="grid gap-4 lg:grid-cols-2"><FoodList title="Food ideas to include" items={plan.favour} empty="No general or document-backed food ideas match these preferences yet." expanded={expanded} onExpand={setExpanded} /><FoodList title="Foods to limit" items={plan.limit} empty="No general or document-backed items to limit match these preferences yet." expanded={expanded} onExpand={setExpanded} /></div>
          </div>}
        </div>
      )}

      {tab === "Daily routine" && (
        <div className="space-y-4">
          {!plan && <div className="rounded-2xl border border-white/10 p-5 text-sm leading-6 text-[#9FB08F]">Build a plan from the Diet tab to see general daily routine ideas with public-health sources, alongside any applicable reference-document items.</div>}
          {plan && <section className="rounded-2xl border border-white/10 p-4 sm:p-5"><h3 className="font-display text-xl font-semibold text-[#EAF2DD]">Dinacharya · {plan.season}</h3>{plan.routine.length ? <ol className="mt-4 space-y-3 border-l border-[#A9C97C]/30 pl-4">{plan.routine.map((item) => <li key={item.id} className="relative rounded-xl border border-white/10 bg-white/[0.025] p-3 before:absolute before:-left-[22px] before:top-4 before:h-3 before:w-3 before:rounded-full before:bg-[#A9C97C]"><button type="button" aria-expanded={routineExpanded === item.id} onClick={() => setRoutineExpanded(routineExpanded === item.id ? null : item.id)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left"><span className="font-medium text-[#D5DFC9]">{item.title}</span><span className="text-xs capitalize text-[#A9C97C]">{item.slot}</span></button>{routineExpanded === item.id && <div className="mt-2 text-sm leading-6 text-[#B7C4A9]"><p>{item.description}</p><p className="mt-1 text-xs text-[#9FB08F]">{item.reason} · {item.source_ids[0]?.title ?? item.source_label}{item.source_ids[0]?.page ? `, page ${item.source_ids[0].page}` : ""}{item.status === "draft" ? " · Draft" : ""}</p></div>}</li>)}</ol> : <p className="mt-3 text-sm text-[#9FB08F]">No source-backed routine items are available for this selection yet.</p>}</section>}
          <button type="button" onClick={() => navigate(`/chat?context=${encodeURIComponent(contextText)}`)} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-[#D5DFC9]">Ask a follow-up question</button>
        </div>
      )}

      {tab === "Seasonal guide" && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display text-xl font-semibold text-[#EAF2DD]">Ritucharya · six-season guide</h3><p className="mt-1 text-xs text-[#9FB08F]">Default calendar: India; change the season to adjust for your region.</p></div><label className="text-xs text-[#B7C4A9]">Season<select value={selectedSeason} onChange={(event) => void changeSeason(event.target.value)} className="ml-2 rounded-lg border border-white/15 bg-[#102117] px-3 py-2 text-sm text-[#EAF2DD]">{["Shishira", "Vasanta", "Grishma", "Varsha", "Sharad", "Hemanta"].map((name) => <option key={name} value={name}>{name}</option>)}</select></label></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{["Shishira", "Vasanta", "Grishma", "Varsha", "Sharad", "Hemanta"].map((name) => <button key={name} type="button" aria-pressed={selectedSeason === name} onClick={() => void changeSeason(name)} className={`rounded-xl border p-3 text-left ${selectedSeason === name ? "border-[#A9C97C]/50 bg-[#8FAF5A]/10" : "border-white/10"}`}><span className="font-medium text-[#D5DFC9]">{name}</span>{season?.name === name && <span className="ml-2 text-[10px] uppercase text-[#A9C97C]">Current selection</span>}</button>)}</div>
            {season && <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="text-sm text-[#D5DFC9]">{season.name} · India calendar months {season.months.join(", ")}</p>{season.note_error && <p role="status" className="mt-2 text-sm text-[#E6D49A]">Seasonal document guidance could not be extracted: {season.note_error}</p>}{season.description || season.food_notes || season.routine_notes ? <div className="mt-2 space-y-2 text-sm leading-6 text-[#B7C4A9]">{season.description && <p>{season.description}</p>}{season.food_notes && <p><strong>Food:</strong> {season.food_notes}</p>}{season.routine_notes && <p><strong>Routine:</strong> {season.routine_notes}</p>}</div> : <p className="mt-2 text-sm text-[#9FB08F]">No seasonal facts are stored yet. Add a trusted diet and lifestyle document to ground this guide.</p>}<p className="mt-3 text-[10px] text-[#A9C97C]">{season.source_ids.length ? `${season.status === "draft" ? "Draft · " : ""}${season.source_ids.map((source) => `${source.title}${source.page ? `, p. ${source.page}` : ""}`).join(" · ")}` : "General knowledge · calendar structure only"}</p></div>}
          </section>
          <button type="button" onClick={() => navigate(`/chat?context=${encodeURIComponent(contextText)}`)} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-[#D5DFC9]">Ask a follow-up question</button>
        </div>
      )}

      <footer className="mt-6 rounded-xl border border-white/10 bg-black/10 p-4 text-xs leading-5 text-[#9FB08F]">
        <p>{safety?.disclaimer ?? "General wellness guidance only; ask your doctor or qualified Ayurvedic practitioner about personal needs."}</p>
        <p className="mt-1">{disclaimer}</p>
        <p className="mt-2">General ideas link to public-health references; document-based items identify their source. No herbs or supplements are recommended here.</p>
      </footer>
      {plan?.references.length ? <div className="mt-3"><SourceList references={plan.references} /></div> : null}
    </section>
  );
}

function SourceList({ references }: { references: Plan["references"] }) {
  return <section className="rounded-xl border border-white/10 p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">References</h3><ul className="mt-2 flex flex-wrap gap-2">{references.map((reference) => <li key={`${reference.title}-${reference.page ?? 0}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#B7C4A9]">{reference.url ? <a href={reference.url} target="_blank" rel="noreferrer" className="underline hover:text-[#A9C97C]">{reference.title}{reference.page ? `, page ${reference.page}` : ""}</a> : <>{reference.title}{reference.page ? `, page ${reference.page}` : ""}</>}</li>)}</ul></section>;
}
