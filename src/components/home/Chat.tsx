import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

/* File location: src/components/home/Chat.tsx */
import logo from "../../assets/ayurvedAI_logo.png";
import { ProfileAvatar, loadUser } from "./Avatars";
import { EASE } from "./ui";
import Locator from "./Locator";
import HerbsCatalog from "./HerbsCatalog";
import ComparePage from "./ComparePage";
import {
  CloseIcon,
  LeafIcon,
  LogoutIcon,
  PinIcon,
} from "./icons";

/* ------------------------------------------------------------------ */
/* API address (change in a .env file:  VITE_API_BASE_URL=...)         */
/* ------------------------------------------------------------------ */
const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

/* types */

type Role = "user" | "assistant";

interface Source {
  id: number;
  filename: string;
  page: number;
  snippet: string;
}

interface Candidate {
  scientific: string;
  common: string[];
  family: string;
  score: number;
  ayurvedic: string;
  toxic: boolean;
}

interface Identification {
  provider: "plantnet" | "gemini" | "both";
  shown?: string;
  candidates: Candidate[];
  top: Candidate;
  confident: boolean;
  low: boolean;
}

interface SafetyNotice {
  level: "info" | "warning" | "emergency";
  flags: string[];
  messages: string[];
  show_professional_cta: boolean;
  disclaimer: string;
}

interface Message {
  id: string;
  role: Role;
  content: string;
  images?: string[];
  mode?: "documents" | "general" | "emergency";
  sources?: Source[];
  identification?: Identification | null;
  safety?: SafetyNotice;
  isError?: boolean;
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
}

interface DocInfo {
  doc_id: string;
  filename: string;
  chunks: number;
}

/* theme tokens (from login page) */

const GREEN_GRADIENT = "linear-gradient(135deg, #A9C97C 0%, #7CA653 55%, #3F6B3F 100%)";
const GREEN_SHADOW = "0 10px 24px -8px rgba(124,166,83,0.55)";
const GLASS: CSSProperties = {
  background: "rgba(150,190,120,0.08)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  boxShadow: "0 25px 70px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14)",
};

const COMPOSER_GLASS: CSSProperties = {
  background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(150,190,120,0.07) 100%)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  boxShadow:
    "0 25px 70px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.05)",
};

/* small local icons */

const svg = (d: ReactNode) => ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {d}
  </svg>
);

/* Herb photo identification (Module: Herb Image Identification) */
const SHOW_IMAGE_BUTTON = true;
const MAX_PHOTOS = 5; /* Pl@ntNet accepts up to 5 photos of the same plant per request */

interface Photo {
  id: string;
  url: string;
  file: File;
}

const PlusIcon = svg(<path d="M12 5v14M5 12h14" />);
const HomeIcon = svg(<path d="M3 11l9-7 9 7M5 10v10h14V10" />);
const ChatIcon = svg(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />);
const ImageIcon = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m21 16-5-5-9 9" />
  </>
);
/* NEW: paperclip icon for attaching PDF / Word documents */
const PaperclipIcon = svg(
  <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
);

const ArrowUpIcon = svg(<path d="M12 19V5M5 12l7-7 7 7" />);
const PanelIcon = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M9 4v16" />
  </>
);

/* content */

/* Each sidebar page. "mode" tells the page which menu item is the current one. */
type Mode = "chat" | "identify" | "herbs" | "compare" | "locator";

const MENU: { label: string; icon: ComponentType<{ className?: string }>; to: string; mode?: Mode }[] = [
  { label: "New chat", icon: PlusIcon, to: "" },
  { label: "Home", icon: HomeIcon, to: "/" },
  { label: "Ask AyurvedAI", icon: ChatIcon, to: "/chat", mode: "chat" },
  { label: "Identify Herb", icon: LeafIcon, to: "/identify", mode: "identify" },
  { label: "Herbs & Medicines", icon: LeafIcon, to: "/herbs", mode: "herbs" },
  { label: "Compare", icon: LeafIcon, to: "/compare", mode: "compare" },
  { label: "Healthcare Locator", icon: PinIcon, to: "/locator", mode: "locator" },
];

const PAGE_TITLE: Record<Mode, string> = {
  chat: "Ask AyurvedAI",
  identify: "Identify Herb",
  herbs: "Herbs & Medicines",
  compare: "Compare Herbs & Medicines",
  locator: "Healthcare Locator",
};

const uid = () => Math.random().toString(36).slice(2, 10);

const freshSession = (): Session => ({ id: uid(), title: "New chat", messages: [] });

/* Keeps each page's chats alive while you move between pages (cleared on browser refresh). */
const CACHE: Partial<Record<Mode, { sessions: Session[]; activeId: string }>> = {};

/* ------------------------------------------------------------------ */
/* REAL API CALLS                  */
/* ------------------------------------------------------------------ */

interface StreamHandlers {
  onMeta: (meta: { mode: Message["mode"]; sources: Source[]; identification?: Identification | null; safety?: SafetyNotice }) => void;
  onDelta: (text: string) => void;
  onSafety: (safety: SafetyNotice) => void;
}

/* Reads the server's event stream (words arrive as soon as the AI starts writing) */
async function readStream(res: Response, h: StreamHandlers): Promise<void> {
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => null);
    throw new Error(typeof err?.detail === "string" ? err.detail : `Server error (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const events = pending.split("\n\n");
    pending = events.pop() ?? "";

    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith("data:")) continue;
      let data: {
        type: string;
        text?: string;
        mode?: Message["mode"];
        sources?: Source[];
        identification?: Identification | null;
        safety?: SafetyNotice;
        message?: string;
      };
      try {
        data = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (data.type === "meta") {
        h.onMeta({
          mode: data.mode,
          sources: data.sources ?? [],
          identification: data.identification,
          safety: data.safety,
        });
      }
      else if (data.type === "delta" && data.text) h.onDelta(data.text);
      else if (data.type === "done" && data.safety) h.onSafety(data.safety);
      else if (data.type === "error") throw new Error(data.message ?? "The AI could not answer.");
    }
  }
}

async function streamAyurvedAI(
  question: string,
  history: { role: Role; content: string }[],
  userKey: string,
  h: StreamHandlers
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userKey },
    body: JSON.stringify({ message: question, history }),
  });
  await readStream(res, h);
}

/* Photo of a herb (+ optional question): identifies the plant, then streams the Ayurvedic answer */
async function streamIdentify(
  photos: File[],
  question: string,
  history: { role: Role; content: string }[],
  userKey: string,
  h: StreamHandlers
): Promise<void> {
  const form = new FormData();
  photos.forEach((p) => form.append("files", p));
  form.append("question", question);
  form.append("history", JSON.stringify(history));
  const res = await fetch(`${API_BASE}/api/identify/stream`, {
    method: "POST",
    headers: { "X-User-Id": userKey },
    body: form,
  });
  await readStream(res, h);
}

/* text renderer: headings, bullets, numbered lists and **bold** */

function inline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  /* **bold** (may contain *italic*)  or  *italic* */
  const re = /\*\*([\s\S]+?)\*\*|\*(?!\s)([^*\n]+?)(?<!\s)\*/g;
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={`${keyPrefix}-t${n++}`}>{text.slice(last, m.index)}</span>);
    if (m[1] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b${n++}`} className="font-semibold text-[#EAF2DD]">
          {inline(m[1], `${keyPrefix}-in${n}`)}
        </strong>
      );
    } else {
      out.push(
        <em key={`${keyPrefix}-e${n++}`} className="italic text-[#C9D8B5]">
          {m[2]}
        </em>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(<span key={`${keyPrefix}-t${n++}`}>{text.slice(last)}</span>);
  return out;
}

function RichText({ text }: { text: string }) {
  /* some models write citations as fullwidth brackets; show them as plain [1] */
  text = text.replace(/\s*[\u3010\[]\s*(\d+(?:\s*,\s*\d+)*)\s*[\u3011\]]/g, " [$1]");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} className="my-2 space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#8FAF5A]" />
            <span>{inline(b)}</span>
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  const heading = (key: number, label: string) => (
    <h3
      key={key}
      className="font-display mb-1 mt-5 text-[19px] font-semibold text-[#A9C97C] first:mt-0"
    >
      {label}
    </h3>
  );

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();

    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }

    flush(`ul-${i}`);

    const hashHeading = line.match(/^#{1,4}\s+(.*)$/);
    const boldHeading = line.match(/^\*\*([^*]+?)\*\*:?$/); // a line that is only **Overview**
    if (hashHeading) {
      blocks.push(heading(i, hashHeading[1].replace(/\*\*/g, "")));
    } else if (boldHeading) {
      blocks.push(heading(i, boldHeading[1]));
    } else if (/^[-*_]{3,}$/.test(line)) {
      /* ignore horizontal rules */
    } else if (line) {
      blocks.push(
        <p key={i} className="my-2">
          {inline(line)}
        </p>
      );
    }
  });
  flush("ul-end");

  return <div className="text-[15px] leading-7 text-[#B7C4A9]">{blocks}</div>;
}

/* components */

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-[#8FAF5A]"
          style={{ animation: `dot 1.2s ease-in-out ${i * 0.16}s infinite` }}
        />
      ))}
    </div>
  );
}

function SafetyConsent({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[860px] items-start justify-between gap-3 px-4 pb-3 sm:px-6">
      <p className="rounded-xl border border-[#E0B84A]/25 bg-[#E0B84A]/[0.07] px-3 py-2 text-xs leading-5 text-[#D8C58D]">
        AyurvedAI provides educational information, not diagnosis or personal treatment. For urgent symptoms, contact emergency services.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-full px-2 py-1 text-xs text-[#A9C97C] hover:bg-white/10"
        aria-label="Dismiss educational information notice"
      >
        Got it
      </button>
    </div>
  );
}

function SafetyPanel({ safety }: { safety: SafetyNotice }) {
  const warning = safety.level === "warning" || safety.level === "emergency" || safety.messages.length > 0;
  return (
    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${
      warning
        ? "border-[#E0B84A]/25 bg-[#E0B84A]/[0.07] text-[#D8C58D]"
        : "border-white/10 bg-white/[0.03] text-[#9FB08F]"
    }`}>
      {warning && safety.messages.length > 0 && (
        <ul className="mb-1 list-disc space-y-1 pl-4">
          {safety.messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}
      {safety.disclaimer}
      {safety.show_professional_cta && (
        <span className="mt-1 block font-medium">Ask a qualified healthcare professional before making personal health decisions.</span>
      )}
    </div>
  );
}

/* shows what the photo was identified as */
function IdentCard({ ident }: { ident: Identification }) {
  const top = ident.top;
  const pct = (n: number) => Math.round(n * 100);
  const title = ident.low ? "Could not identify with confidence" : top.ayurvedic || top.common[0] || top.scientific;
  return (
    <div className="mb-3 rounded-2xl border border-white/15 p-4" style={GLASS}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#A9C97C]">
            {ident.low ? "Closest guesses from your photo" : "Identified from your photo"}
          </p>
          <h3 className="mt-1 text-lg font-semibold leading-snug text-[#EAF2DD]">{title}</h3>
          {!ident.low && (
            <p className="text-sm italic text-[#C9D8B5]">
              {top.scientific}
              {top.family ? ` · ${top.family}` : ""}
            </p>
          )}
          {ident.shown && <p className="mt-0.5 text-xs text-[#9FB08F]">Photo shows: {ident.shown}</p>}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            ident.confident ? "bg-[#8FAF5A]/20 text-[#A9C97C]" : "bg-[#E0B84A]/15 text-[#E0B84A]"
          }`}
        >
          {pct(top.score)}% match
        </span>
      </div>

      {top.toxic && (
        <p className="mt-3 rounded-xl border border-[#E8967A]/40 bg-[#E8967A]/10 px-3 py-2 text-sm text-[#F2B7A3]">
          Warning: this plant is poisonous. Do not eat it or use it at home.
        </p>
      )}
      {ident.low && (
        <p className="mt-3 text-sm text-[#E0B84A]">
          These are only weak guesses. Try a clearer photo, or add 2 to 3 photos of the same plant.
        </p>
      )}
      {!ident.confident && !ident.low && (
        <p className="mt-3 text-sm text-[#E0B84A]">Not fully certain. Please double-check with an expert.</p>
      )}
      {!ident.low && (
        <Link
          to={`/herbs?q=${encodeURIComponent(top.ayurvedic || top.common[0] || top.scientific)}`}
          className="mt-3 inline-flex rounded-xl border border-[#A9C97C]/30 px-3 py-2 text-xs font-medium text-[#C9D8B5] transition hover:bg-[#8FAF5A]/10"
        >
          View in Herbs &amp; Medicines
        </Link>
      )}

      {(ident.low ? ident.candidates.length > 0 : ident.candidates.length > 1) && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-[#9FB08F]">
            {ident.low ? "Possibilities" : "Other possibilities"}
          </p>
          {(ident.low ? ident.candidates : ident.candidates.slice(1)).map((c) => (
            <div key={c.scientific} className="flex items-center gap-3 text-[13px] text-[#B7C4A9]">
              <span className="min-w-0 flex-1 truncate">
                {c.ayurvedic || c.common[0] || c.scientific} <span className="italic opacity-70">({c.scientific})</span>
              </span>
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-[#8FAF5A]" style={{ width: `${pct(c.score)}%` }} />
              </span>
              <span className="w-9 text-right">{pct(c.score)}%</span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[#9FB08F]">
        {ident.provider === "plantnet"
          ? "The image-based plant species identification service used is based on the Pl@ntNet recognition API."
          : ident.provider === "both"
            ? "Identified by combining the Pl@ntNet recognition API with an AI vision model."
            : "Estimated by an AI vision model, so it can be wrong."}{" "}
        Never eat or use a plant only because a photo suggests a name.
      </p>
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const isUser = m.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={`flex ${isUser ? "justify-end" : ""}`}
    >
      <div className={`flex min-w-0 max-w-[85%] flex-col ${isUser ? "items-end" : ""}`}>
        {m.images && m.images.length > 0 && (
          <div
            className={`mb-2 grid gap-2 self-end ${
              m.images.length === 1 ? "grid-cols-1" : m.images.length === 2 ? "grid-cols-2" : "grid-cols-3"
            }`}
          >
            {m.images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Uploaded herb ${i + 1}`}
                className={`rounded-2xl border border-white/15 object-cover ${
                  m.images!.length === 1 ? "h-40 w-40" : "h-24 w-24"
                }`}
              />
            ))}
          </div>
        )}

        {isUser ? (
          <div
            className="rounded-3xl rounded-tr-md border border-white/15 px-5 py-3 text-[15px] leading-7 text-[#EAF2DD]"
            style={GLASS}
          >
            {m.content}
          </div>
        ) : (
          <div
            className={
              m.mode === "emergency"
                ? "rounded-2xl border border-[#E8967A]/40 bg-[#E8967A]/10 p-4"
                : m.isError
                  ? "rounded-2xl border border-[#E8967A]/30 bg-[#E8967A]/10 px-4 py-3"
                  : "pt-1"
            }
          >
            {m.identification && <IdentCard ident={m.identification} />}

            {m.mode === "documents" && (
              <span className="mb-2 inline-block rounded-full bg-[#E0B84A]/15 px-3 py-1 text-xs font-medium text-[#E0B84A]">
                Answered from documents
              </span>
            )}
            {m.mode === "general" && (
              <span className="mb-2 inline-block rounded-full bg-[#8FAF5A]/15 px-3 py-1 text-xs font-medium text-[#A9C97C]">
                General Ayurvedic knowledge
              </span>
            )}

            {m.isError ? (
              <p className="text-[15px] leading-7 text-[#F2C4B5]">{m.content}</p>
            ) : (
              <RichText text={m.content} />
            )}

            {m.safety && <SafetyPanel safety={m.safety} />}

            {m.sources && m.sources.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                <span className="text-xs font-semibold text-[#8FA080]">Sources</span>
                {m.sources.map((s) => (
                  <span
                    key={s.id}
                    title={s.snippet}
                    className="rounded-full bg-[#8FAF5A]/15 px-3 py-1 text-xs font-medium text-[#A9C97C]"
                  >
                    [{s.id}] {s.filename}
                    {s.page ? ` · p.${s.page}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* empty-state screens */

function ChatIntro({ onAsk }: { onAsk: (q: string) => void }) {
  const ideas = [
    "Herbs to improve digestion",
    "Daily routine (dinacharya) for better sleep",
    "What is my dosha and diet for Pitta?",
  ];
  return (
    <div className="flex flex-col items-center pt-10 text-center sm:pt-16">
      <h2 className="font-display text-[28px] font-semibold text-[#EAF2DD]">Ask AyurvedAI</h2>
      <p className="mt-2 max-w-[480px] text-sm text-[#9FB08F]">
        Ask about herbs, medicines, diet and lifestyle. Attach a PDF or Word file to get answers from it.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {ideas.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onAsk(q)}
            className="rounded-full border border-white/15 px-4 py-2 text-[13px] text-[#B7C4A9] transition hover:bg-white/10 hover:text-[#EAF2DD]"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function IdentifyIntro({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex flex-col items-center pt-10 text-center sm:pt-16">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#8FAF5A]/15 text-[#A9C97C]">
        <LeafIcon className="h-7 w-7" />
      </span>
      <h2 className="font-display mt-4 text-[28px] font-semibold text-[#EAF2DD]">Identify a herb</h2>
      <p className="mt-2 max-w-[480px] text-sm text-[#9FB08F]">
        Add up to {MAX_PHOTOS} photos of the same plant: leaf, flower, root, seeds or powder. Then press send.
      </p>
      <button
        type="button"
        onClick={onPick}
        className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
        style={{ background: GREEN_GRADIENT, boxShadow: GREEN_SHADOW }}
      >
        <ImageIcon className="h-5 w-5" />
        Choose photos
      </button>
    </div>
  );
}

/* page */

/* One component per sidebar page. The key makes React start fresh when the page (mode) changes. */
export default function Chat({ mode = "chat" }: { mode?: Mode }) {
  return <ChatPage key={mode} mode={mode} />;
}

function ChatPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useMemo(() => loadUser(), []);
  const userName = user.name || "User";
  const userEmail = "email" in user ? String(user.email ?? "") : "";
  /* temporary identity used to keep each user's documents separate */
  const userKey = useMemo(() => {
    const u = user as unknown as Record<string, unknown>;
    return String(u.id ?? u.email ?? "guest");
  }, [user]);

  const [sessions, setSessions] = useState<Session[]>(() => CACHE[mode]?.sessions ?? [freshSession()]);
  const [activeId, setActiveId] = useState<string>(() => CACHE[mode]?.activeId ?? sessions[0].id);
  const [input, setInput] = useState(() => {
    const herb = new URLSearchParams(location.search).get("herb");
    return mode === "chat" && herb ? `Tell me about ${herb} using my reference documents.` : "";
  });
  const [photos, setPhotos] = useState<Photo[]>([]); /* up to 5 herb photos that are sent together */
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false); /* true until the first words arrive */
  const [showSafetyConsent, setShowSafetyConsent] = useState(true);
  const [sidebar, setSidebar] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  /* NEW: uploaded documents */
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const messages = active.messages;

  /* remember this page's chats so they are still here when you come back from another page */
  useEffect(() => {
    CACHE[mode] = { sessions, activeId };
  }, [mode, sessions, activeId]);

  /* auto scroll */
  const lastLen = messages[messages.length - 1]?.content.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth", block: "end" });
  }, [messages.length, waiting, lastLen, loading]);

  /* auto-grow textarea */
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  /* load this user's documents from the server */
  const loadDocs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/documents`, { headers: { "X-User-Id": userKey } });
      if (res.ok) setDocs((await res.json()).documents ?? []);
    } catch {
      /* backend not running - ignore */
    }
  };

  useEffect(() => {
    if (mode === "chat" || mode === "identify") loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, userKey]);

  const patchActive = (fn: (s: Session) => Session) =>
    setSessions((all) => all.map((s) => (s.id === activeId ? fn(s) : s)));

  const newChat = () => {
    setInput("");
    setPhotos([]);
    setNotice(null);
    setSidebar(false);

    if (mode === "compare") {
      navigate("/chat");
      return;
    }

    /* from the Locator page there is no chat, so open a fresh one on the Ask page */
    if (mode === "locator") {
      const c = CACHE.chat;
      const cur = c?.sessions.find((x) => x.id === c.activeId);
      if (!(c && cur && cur.messages.length === 0)) {
        const s = freshSession();
        CACHE.chat = { sessions: [s, ...(c?.sessions ?? [])], activeId: s.id };
      }
      navigate("/chat");
      return;
    }

    /* already on an empty chat: nothing new to create */
    if (active.messages.length === 0) {
      taRef.current?.focus();
      return;
    }
    const s = freshSession();
    setSessions((all) => [s, ...all]);
    setActiveId(s.id);
    taRef.current?.focus();
  };

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if ((!q && photos.length === 0) || loading) return;
    if (mode === "identify" && photos.length === 0 && messages.length === 0) {
      setNotice("Add at least one herb photo first (use the image button).");
      window.setTimeout(() => setNotice(null), 4000);
      return;
    }

    /* last few messages are sent so the AI understands follow-up questions */
    const history = messages
      .filter((m) => !m.isError)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    const sending = photos;

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: q || (sending.length > 1 ? "Please identify this herb from these photos." : "Please identify this herb."),
      images: sending.length ? sending.map((p) => p.url) : undefined,
    };

    patchActive((s) => ({
      ...s,
      title: s.messages.length === 0 ? userMsg.content.slice(0, 32) : s.title,
      messages: [...s.messages, userMsg],
    }));
    setInput("");
    setPhotos([]); /* the preview links stay alive: the chat bubble still shows these photos */

    setLoading(true);
    setWaiting(true);

    const aid = uid();
    let created = false;
    let buf = "";
    let raf = 0;
    let meta: { mode: Message["mode"]; sources: Source[]; identification?: Identification | null; safety?: SafetyNotice } = {
      mode: undefined,
      sources: [],
    };
    let safety: SafetyNotice | undefined;

    const flush = () => {
      raf = 0;
      patchActive((s) => ({
        ...s,
        messages: s.messages.map((m) => (m.id === aid ? { ...m, content: buf, safety } : m)),
      }));
    };

    try {
      const handlers: StreamHandlers = {
        onMeta: (m) => {
          meta = m;
          safety = m.safety;
        },
        onDelta: (t) => {
          buf += t;
          if (!created) {
            created = true;
            setWaiting(false);
            patchActive((s) => ({
              ...s,
              messages: [
                ...s.messages,
                {
                  id: aid,
                  role: "assistant",
                  content: buf,
                  mode: meta.mode,
                  sources: meta.sources,
                  identification: meta.identification,
                  safety,
                },
              ],
            }));
          } else if (!raf) {
            raf = requestAnimationFrame(flush); /* update the screen at most once per frame */
          }
        },
        onSafety: (notice) => {
          safety = notice;
          if (created) {
            patchActive((s) => ({
              ...s,
              messages: s.messages.map((m) => (m.id === aid ? { ...m, safety: notice } : m)),
            }));
          }
        },
      };
      if (sending.length) await streamIdentify(sending.map((p) => p.file), q, history, userKey, handlers);
      else await streamAyurvedAI(q, history, userKey, handlers);
      if (raf) cancelAnimationFrame(raf);
      if (created) flush();
    } catch (e) {
      if (raf) cancelAnimationFrame(raf);
      const msg =
        e instanceof TypeError
          ? "Cannot reach the server. Please check that the backend is running on port 8000."
          : (e as Error).message;
      if (created) {
        buf += "\n\n(The answer was interrupted. Please try again.)";
        flush();
      } else {
        patchActive((s) => ({
          ...s,
          messages: [...s.messages, { id: uid(), role: "assistant", content: msg, isError: true }],
        }));
      }
    } finally {
      setLoading(false);
      setWaiting(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  /* add the chosen photos to the ones already selected (never replace them), up to MAX_PHOTOS */
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = ""; /* lets the same photo be chosen again later */
    if (chosen.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    const fresh = chosen
      .filter((f) => !photos.some((p) => p.file.name === f.name && p.file.size === f.size)) /* skip exact duplicates */
      .slice(0, Math.max(room, 0))
      .map((f) => ({ id: uid(), url: URL.createObjectURL(f), file: f }));
    if (fresh.length) setPhotos((cur) => [...cur, ...fresh].slice(0, MAX_PHOTOS));
    if (chosen.length > room) {
      setNotice(`You can add up to ${MAX_PHOTOS} photos at a time.`);
      window.setTimeout(() => setNotice(null), 4000);
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((cur) => {
      const gone = cur.find((p) => p.id === id);
      /* only free the preview if no sent message uses it (unsent photos are never in a message) */
      if (gone) URL.revokeObjectURL(gone.url);
      return cur.filter((p) => p.id !== id);
    });
  };

  /* NEW: upload a PDF / DOCX / TXT so the AI answers from it first */
  const onDoc = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    setNotice(`Reading "${f.name}"… the first upload can take a minute.`);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`${API_BASE}/api/chat/documents`, {
        method: "POST",
        headers: { "X-User-Id": userKey },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? `Upload failed (${res.status})`);
      setNotice(`"${data.filename}" added. Ask me anything from it.`);
      loadDocs();
      setTimeout(() => setNotice(null), 5000);
    } catch (err) {
      setNotice(err instanceof TypeError ? "Cannot reach the server." : (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/chat/documents/${id}`, {
        method: "DELETE",
        headers: { "X-User-Id": userKey },
      });
    } finally {
      loadDocs();
    }
  };

  /* open/close menu */
  const toggleMenu = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) setDesktopOpen((o) => !o);
    else setSidebar((o) => !o);
  };

  const logout = () => {
    localStorage.removeItem("ayurvedai_user");
    navigate("/login");
  };

  /* sidebar */
  const Sidebar = (
    <div className="flex h-full w-[290px] flex-col border-r border-white/10 bg-[#0A1710]/95 backdrop-blur-xl">
      {/* brand + menu toggle */}
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex min-w-0 items-center gap-3 text-left focus-visible:outline-none"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden">
            <img src={logo} alt="AyurvedAI" className="h-full w-full object-contain" />
          </span>
          <span className="font-display truncate text-[22px] font-semibold tracking-tight text-[#EAF2DD]">
            AyurvedAI
          </span>
        </button>

        <button
          type="button"
          aria-label="Close menu"
          onClick={toggleMenu}
          className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#A9C97C] transition hover:bg-white/10 hover:text-[#EAF2DD]"
        >
          <PanelIcon className="h-5 w-5" />
        </button>
      </div>

      {/* menu */}
      <nav className="mt-5 px-3">
        {MENU.map((m) => {
          const current = m.mode === mode; /* the page you are on gets the green highlight */
          return (
            <button
              key={m.label}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => {
                if (m.label === "New chat") return newChat();
                setSidebar(false);
                navigate(m.to);
              }}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] font-medium transition ${
                current
                  ? "bg-[#8FAF5A]/15 text-[#A9C97C]"
                  : "text-[#B7C4A9] hover:bg-white/5 hover:text-[#EAF2DD]"
              }`}
            >
              <m.icon className="h-5 w-5" />
              {m.label}
            </button>
          );
        })}
      </nav>

      {/* recent chats of this page */}
      {(mode === "chat" || mode === "identify") && sessions.some((x) => x.messages.length > 0) && (
        <div className="mt-5 max-h-[34vh] overflow-y-auto px-3">
          <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#7E9077]">Recent</p>
          {sessions
            .filter((x) => x.messages.length > 0)
            .map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => {
                  setActiveId(x.id);
                  setSidebar(false);
                }}
                className={`mb-1 block w-full truncate rounded-xl px-4 py-2 text-left text-[13px] transition ${
                  x.id === activeId
                    ? "bg-white/10 text-[#EAF2DD]"
                    : "text-[#9FB08F] hover:bg-white/5 hover:text-[#EAF2DD]"
                }`}
              >
                {x.title || "New chat"}
              </button>
            ))}
        </div>
      )}

      <div className="flex-1" />

      {/* profile */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <ProfileAvatar value={user.avatar} name={userName} className="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-[#EAF2DD]">{userName}</p>
            <p className="truncate text-xs text-[#8FA080]">{userEmail}</p>
          </div>
          <button
            type="button"
            aria-label="Logout"
            onClick={logout}
            className="rounded-full p-2 text-[#E8967A] transition hover:bg-white/10"
          >
            <LogoutIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  /* render */
  return (
    <div
      className="relative flex h-screen overflow-hidden text-[#EAF2DD]"
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background:
          "radial-gradient(70% 55% at 50% 8%, rgba(200,231,180,0.14) 0%, rgba(200,231,180,0) 60%), linear-gradient(180deg, #0A1710 0%, #12251A 40%, #16301F 72%, #0D1F14 100%)",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');
        body { margin:0; font-family:'Inter',system-ui,sans-serif; background:#0A1710; -webkit-font-smoothing:antialiased; }
        .font-display { font-family:'Fraunces',serif; }
        button, input, textarea { font-family:inherit; }
        ::selection { background:#A9C97C; color:#12200F; }
        ::-webkit-scrollbar { width:8px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#3F6B3F; border-radius:999px; }
        @keyframes dot { 0%,80%,100%{transform:translateY(0);opacity:.4} 40%{transform:translateY(-4px);opacity:1} }
        @media (prefers-reduced-motion: reduce) {
          *,*::before,*::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
        }
      `}</style>

      {/* desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: desktopOpen ? 290 : 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="relative z-20 hidden shrink-0 overflow-hidden lg:block"
      >
        {Sidebar}
      </motion.aside>

      {/* mobile sidebar */}
      <AnimatePresence>
        {sidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebar(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
            >
              {Sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* main */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* top bar (shows the open button when menu is closed) */}
        <header className="flex h-[64px] items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={toggleMenu}
            className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-[#A9C97C] transition hover:bg-white/10 hover:text-[#EAF2DD] ${
              desktopOpen ? "lg:hidden" : ""
            }`}
            style={GLASS}
          >
            <PanelIcon className="h-5 w-5" />
          </button>
          <h1 className="font-display text-[18px] font-semibold text-[#EAF2DD]">{PAGE_TITLE[mode]}</h1>
        </header>
        {(mode === "chat" || mode === "identify") && showSafetyConsent && (
          <SafetyConsent onDismiss={() => setShowSafetyConsent(false)} />
        )}

        {/* messages */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 40px), transparent 100%)",
            maskImage: "linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 40px), transparent 100%)",
          }}
        >
          <div className={`mx-auto w-full px-4 pb-12 pt-6 sm:px-6 ${mode === "locator" || mode === "compare" ? "max-w-[1100px]" : "max-w-[860px]"}`}>
            {mode === "compare" && <ComparePage userKey={userKey} />}
            {mode === "herbs" && <HerbsCatalog userKey={userKey} />}
            {mode === "locator" && <Locator userKey={userKey} />}
            {mode === "identify" && messages.length === 0 && <IdentifyIntro onPick={() => fileRef.current?.click()} />}
            {mode === "chat" && messages.length === 0 && <ChatIntro onAsk={(q) => send(q)} />}
            {messages.length > 0 && (
              <div className="space-y-7">
                {messages.map((m) => (
                  <Bubble key={m.id} m={m} />
                ))}

                {waiting && <TypingDots />}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* composer (not shown on the Healthcare Locator page) */}
        {(mode === "chat" || mode === "identify") && (
        <div className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
          <div className="mx-auto w-full max-w-[860px]">
            <div
              className="rounded-[28px] border border-white/25 p-3 transition focus-within:border-[#A9C97C]/70"
              style={COMPOSER_GLASS}
            >
              {photos.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 px-1 pt-1">
                  {photos.map((p, i) => (
                    <div key={p.id} className="relative m-2">
                      <img src={p.url} alt={`Selected photo ${i + 1}`} className="h-20 w-20 rounded-2xl object-cover" />
                      <button
                        type="button"
                        aria-label={`Remove photo ${i + 1}`}
                        onClick={() => removePhoto(p.id)}
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#0A1710] ring-1 ring-white/30"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      aria-label="Add more photos"
                      onClick={() => fileRef.current?.click()}
                      className="m-2 flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[#A9C97C]/50 text-[11px] text-[#A9C97C] transition hover:bg-white/5"
                    >
                      <PlusIcon className="h-5 w-5" />
                      Add more
                    </button>
                  )}
                  <p className="basis-full px-2 pb-1 text-[11px] text-[#9FB08F]">
                    {photos.length}/{MAX_PHOTOS} photos. Use photos of the same plant (leaf, flower, root, powder).
                  </p>
                </div>
              )}

              {/* NEW: uploaded documents + status message */}
              {(docs.length > 0 || notice) && (
                <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-1">
                  {docs.map((d) => (
                    <span
                      key={d.doc_id}
                      className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full bg-[#8FAF5A]/15 py-1 pl-3 pr-1.5 text-xs font-medium text-[#A9C97C]"
                    >
                      <span className="truncate" title={d.filename}>
                        {d.filename}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${d.filename}`}
                        onClick={() => removeDoc(d.doc_id)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {notice && <span className="text-xs text-[#E0B84A]">{notice}</span>}
                </div>
              )}

              <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple hidden onChange={onFile} />
                <input ref={docRef} type="file" accept=".pdf,.docx,.txt,.md" hidden onChange={onDoc} />

                {/* Herb image upload: switched on in the Herb Identification module (set SHOW_IMAGE_BUTTON = true) */}
                {SHOW_IMAGE_BUTTON && (
                <button
                  type="button"
                  aria-label="Upload herb image"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#A9C97C] transition hover:bg-white/10 hover:text-[#EAF2DD]"
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
                )}

                {/* NEW: attach document */}
                <button
                  type="button"
                  aria-label="Attach a PDF or Word document"
                  title="Attach a PDF, Word or text document"
                  disabled={uploading}
                  onClick={() => docRef.current?.click()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#A9C97C] transition hover:bg-white/10 hover:text-[#EAF2DD] disabled:opacity-50"
                >
                  <PaperclipIcon className="h-5 w-5" />
                </button>

                <textarea
                  ref={taRef}
                  value={input}
                  rows={1}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder={
                    mode === "identify"
                      ? "Optional: where you found it, which part (leaf, root, powder)…"
                      : "Ask about herbs, medicines, diet, lifestyle…"
                  }
                  className="max-h-[180px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-[11px] text-[15px] leading-6 text-[#EAF2DD] placeholder:text-[#7E9077] focus:outline-none"
                />

                <button
                  type="button"
                  aria-label="Send message"
                  onClick={() => send()}
                  disabled={loading || (!input.trim() && photos.length === 0)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-75"
                  style={{ background: GREEN_GRADIENT, boxShadow: GREEN_SHADOW }}
                >
                  <ArrowUpIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <p className="mt-3 text-center text-xs text-[#8FA080]">
              AyurvedAI shares educational information and is not a substitute for professional
              medical advice.
            </p>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
