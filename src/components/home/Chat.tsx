import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

/* File location: src/components/home/Chat.tsx */
import logo from "../../assets/ayurvedAI_logo.png";
import { ProfileAvatar, loadUser } from "./Avatars";
import { EASE } from "./ui";
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

interface Message {
  id: string;
  role: Role;
  content: string;
  image?: string;
  mode?: "documents" | "general" | "emergency";
  sources?: Source[];
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

const MENU = [
  { label: "New chat", icon: PlusIcon, to: "" },
  { label: "Home", icon: HomeIcon, to: "/" },
  { label: "Ask AyurvedAI", icon: ChatIcon, to: "/chat" },
  { label: "Identify Herb", icon: LeafIcon, to: "/chat" },
  { label: "Healthcare Locator", icon: PinIcon, to: "/chat" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

/* ------------------------------------------------------------------ */
/* REAL API CALLS (replaces the old fake askAyurvedAI)                 */
/* ------------------------------------------------------------------ */

interface ApiAnswer {
  content: string;
  mode: Message["mode"];
  sources: Source[];
}

async function askAyurvedAI(
  question: string,
  history: { role: Role; content: string }[],
  userKey: string
): Promise<ApiAnswer> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userKey },
    body: JSON.stringify({ message: question, history }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? `Server error (${res.status})`);
  }
  const data = await res.json();
  return { content: data.answer, mode: data.mode, sources: data.sources ?? [] };
}

/* text renderer: headings, bullets, numbered lists and **bold** */

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-[#EAF2DD]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function RichText({ text }: { text: string }) {
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
        {m.image && (
          <img
            src={m.image}
            alt="Uploaded herb"
            className="mb-2 h-40 w-40 self-end rounded-2xl border border-white/15 object-cover"
          />
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
            {m.mode === "documents" && (
              <span className="mb-2 inline-block rounded-full bg-[#E0B84A]/15 px-3 py-1 text-xs font-medium text-[#E0B84A]">
                Answered from your documents
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

/* page */

export default function Chat() {
  const navigate = useNavigate();
  const user = useMemo(() => loadUser(), []);
  const userName = user.name || "User";
  const userEmail = "email" in user ? String(user.email ?? "") : "";
  /* temporary identity used to keep each user's documents separate */
  const userKey = useMemo(() => {
    const u = user as unknown as Record<string, unknown>;
    return String(u.id ?? u.email ?? "guest");
  }, [user]);

  const [sessions, setSessions] = useState<Session[]>([{ id: uid(), title: "New chat", messages: [] }]);
  const [activeId, setActiveId] = useState(sessions[0].id);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  /* auto scroll */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading]);

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
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  const patchActive = (fn: (s: Session) => Session) =>
    setSessions((all) => all.map((s) => (s.id === activeId ? fn(s) : s)));

  const newChat = () => {
    const s: Session = { id: uid(), title: "New chat", messages: [] };
    setSessions((all) => [s, ...all]);
    setActiveId(s.id);
    setInput("");
    setImage(null);
    setSidebar(false);
  };

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if ((!q && !image) || loading) return;

    /* last few messages are sent so the AI understands follow-up questions */
    const history = messages
      .filter((m) => !m.isError)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: q || "Please identify this herb.",
      image: image ?? undefined,
    };

    patchActive((s) => ({
      ...s,
      title: s.messages.length === 0 ? userMsg.content.slice(0, 32) : s.title,
      messages: [...s.messages, userMsg],
    }));
    setInput("");
    setImage(null);

    /* image only: herb identification is the next module */
    if (!q) {
      patchActive((s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            id: uid(),
            role: "assistant",
            content:
              "Herb image identification is coming in the next module. For now, type the herb's name and I will share what I know about it.",
          },
        ],
      }));
      return;
    }

    setLoading(true);
    try {
      const res = await askAyurvedAI(q, history, userKey);
      patchActive((s) => ({
        ...s,
        messages: [...s.messages, { id: uid(), role: "assistant", ...res }],
      }));
    } catch (e) {
      const msg =
        e instanceof TypeError
          ? "Cannot reach the server. Please check that the backend is running on port 8000."
          : (e as Error).message;
      patchActive((s) => ({
        ...s,
        messages: [...s.messages, { id: uid(), role: "assistant", content: msg, isError: true }],
      }));
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setImage(URL.createObjectURL(f));
    e.target.value = "";
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
          const current = m.label === "Ask AyurvedAI";
          return (
            <button
              key={m.label}
              type="button"
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
        <header className="h-[64px] px-4 py-3 sm:px-6">
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
        </header>

        {/* messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[860px] px-4 py-8 sm:px-6">
            {messages.length > 0 && (
              <div className="space-y-7">
                {messages.map((m) => (
                  <Bubble key={m.id} m={m} />
                ))}

                {loading && (
                  <TypingDots />
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* composer */}
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="mx-auto w-full max-w-[860px]">
            <div
              className="rounded-[28px] border border-white/25 p-2.5 transition focus-within:border-[#A9C97C]/70"
              style={COMPOSER_GLASS}
            >
              {image && (
                <div className="relative m-2 inline-block">
                  <img src={image} alt="Selected" className="h-20 w-20 rounded-2xl object-cover" />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => setImage(null)}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#0A1710] ring-1 ring-white/30"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
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
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
                <input ref={docRef} type="file" accept=".pdf,.docx,.txt,.md" hidden onChange={onDoc} />

                <button
                  type="button"
                  aria-label="Upload herb image"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#A9C97C] transition hover:bg-white/10 hover:text-[#EAF2DD]"
                >
                  <ImageIcon className="h-5 w-5" />
                </button>

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
                  placeholder="Ask about herbs, medicines, diet, lifestyle…"
                  className="max-h-[180px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-[11px] text-[15px] leading-6 text-[#EAF2DD] placeholder:text-[#7E9077] focus:outline-none"
                />

                <button
                  type="button"
                  aria-label="Send message"
                  onClick={() => send()}
                  disabled={loading || (!input.trim() && !image)}
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
      </main>
    </div>
  );
}