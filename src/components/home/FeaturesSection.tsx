import type { ReactNode } from "react";
import { motion } from "framer-motion";
import herb_scan_img from "../../assets/herb_scan_img.png";

import { EASE, LineReveal, Reveal, TiltCard } from "./ui";
import {
  CompareIcon,
  LeafIcon,
  PinIcon,
  SearchIcon,
  SparkleIcon,
  SunIcon,
} from "./icons";

/* -------------------------------------------------------------------------- */
/*  Mini visuals – each card shows a tiny live preview of the feature         */
/* -------------------------------------------------------------------------- */

function ChatVisual() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 rounded-2xl border border-[#DCE3CF] bg-[#F5F7F0] p-4">
      <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-md border border-[#DCE3CF] bg-white px-4 py-3 text-[13px] leading-6 text-[#41564A]">
        Namaste! Ask me about herbs, formulations, diet, or lifestyle.
      </div>

      <div className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-md bg-[#1E5238] px-4 py-2.5 text-[13px] text-[#EAF3DC]">
        What is Triphala traditionally used for?
      </div>

      <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-[#DCE3CF] bg-white px-4 py-3 text-[13px] leading-6 text-[#41564A]">
        Triphala is a classical formulation of three fruits. Here&apos;s a
        structured overview of its documented uses.
        <div className="mt-2.5 flex flex-wrap gap-2">
          <span className="rounded-full bg-[#E4EED5] px-2.5 py-1 text-[11px] font-semibold text-[#2C6A4A]">
            Formulation
          </span>
          <span className="rounded-full bg-[#FBEFC9] px-2.5 py-1 text-[11px] font-semibold text-[#8A5F0B]">
            3 references
          </span>
        </div>
      </div>

      <div className="flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-2 ring-1 ring-[#DCE3CF]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[#2C6A4A]"
            style={{ animation: `dot 1.2s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

function ScanVisual() {
  const corner = "absolute h-5 w-5 border-[#F2CB6B]/80";
  return (
    <div className="relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0A1D14]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(111,162,127,0.28),transparent_65%)]" />

      <span className={`${corner} left-3 top-3 rounded-tl-md border-l-2 border-t-2`} />
      <span className={`${corner} right-3 top-3 rounded-tr-md border-r-2 border-t-2`} />
      <span className={`${corner} bottom-3 left-3 rounded-bl-md border-b-2 border-l-2`} />
      <span className={`${corner} bottom-3 right-3 rounded-br-md border-b-2 border-r-2`} />

      <img
        src={herb_scan_img}
        alt="Herb being identified"
        draggable={false}
        className="absolute left-1/2 top-1/2 h-[75%] w-auto -translate-x-1/2 -translate-y-1/2 select-none object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
      />

      <div
        className="absolute inset-x-4 h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#F2CB6B] to-transparent shadow-[0_0_18px_#F2CB6B]"
        style={{ animation: "scan 3.2s ease-in-out infinite" }}
      />

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-medium text-[#EAF3DC] backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-[#9DBF7A]" />
        Herb identified · image match
      </div>
    </div>
  );
}

function SearchVisual() {
  const chips = ["Herbs", "Medicines", "Formulations", "Conditions", "Diet", "Precautions", "References"];
  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl border border-[#DCE3CF] bg-[#F5F7F0] px-4 py-3">
        <SearchIcon className="h-4 w-4 text-[#2C6A4A]" />
        <span className="text-[13px] text-[#41564A]">
          Ashwagandha
          <span
            className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] bg-[#2C6A4A]"
            style={{ animation: "blink 1s steps(1) infinite" }}
          />
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <span
            key={c}
            className="rounded-full border border-[#DCE3CF] bg-white px-3 py-1.5 text-[12px] font-medium text-[#41564A] transition-colors hover:border-[#2C6A4A]/40 hover:bg-[#E4EED5]"
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function CompareVisual() {
  const rows = [
    { label: "Properties", a: 78, b: 52 },
    { label: "Documented uses", a: 88, b: 64 },
    { label: "Precautions", a: 46, b: 72 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["Herb A", "Herb B"] as const).map((name, col) => (
        <div
          key={name}
          className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5"
        >
          <p className="text-[12px] font-semibold text-[#F2CB6B]">{name}</p>
          <div className="mt-3 space-y-3">
            {rows.map((r) => (
              <div key={r.label}>
                <p className="text-[10.5px] text-[#A9BCA6]">{r.label}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${col === 0 ? r.a : r.b}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.3, delay: 0.2 + col * 0.15, ease: EASE }}
                    className="h-full rounded-full bg-gradient-to-r from-[#6FA27F] to-[#C9DDB0]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DietVisual() {
  const tiles = [
    { term: "Dinacharya", meaning: "Daily routine" },
    { term: "Ritucharya", meaning: "Seasonal routine" },
    { term: "Ahara", meaning: "Diet" },
    { term: "Vihara", meaning: "Lifestyle" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tiles.map((t) => (
        <div
          key={t.term}
          className="rounded-2xl border border-[#E6D08E] bg-white/60 px-3.5 py-3"
        >
          <p className="font-display text-[16px] font-medium text-[#4A3608]">{t.term}</p>
          <p className="mt-0.5 text-[11.5px] text-[#7A6528]">{t.meaning}</p>
        </div>
      ))}
    </div>
  );
}

function LocatorVisual() {
  const pins = [
    { left: "26%", top: "34%", delay: "0s" },
    { left: "62%", top: "22%", delay: "0.6s" },
    { left: "74%", top: "64%", delay: "1.2s" },
  ];
  return (
    <div className="relative h-[250px] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0A1D14]">
      <svg
        viewBox="0 0 400 250"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        fill="none"
      >
        <g stroke="rgba(201,221,176,0.16)" strokeWidth="2">
          <path d="M-10 60 C 90 70, 140 30, 230 55 S 350 90, 420 60" />
          <path d="M-10 170 C 80 150, 160 200, 250 175 S 360 140, 420 180" />
          <path d="M90 -10 C 100 60, 70 130, 110 260" />
          <path d="M270 -10 C 250 70, 300 150, 280 260" />
        </g>
        <g stroke="rgba(201,221,176,0.08)" strokeWidth="1">
          <path d="M-10 115 H 420M-10 215 H 420M180 -10 V 260M340 -10 V 260" />
        </g>
      </svg>

      {pins.map((p, i) => (
        <div key={i} className="absolute" style={{ left: p.left, top: p.top }}>
          <span
            className="absolute -inset-3 rounded-full bg-[#F2CB6B]/35"
            style={{ animation: `pulseRing 2.6s ease-out ${p.delay} infinite` }}
          />
          <PinIcon className="relative h-7 w-7 -translate-x-1/2 -translate-y-full text-[#F2CB6B]" />
        </div>
      ))}

      <div className="absolute left-[46%] top-[52%]">
        <span className="absolute -inset-2 animate-ping rounded-full bg-[#9DBF7A]/50" />
        <span className="relative block h-3 w-3 rounded-full border-2 border-white bg-[#6FA27F]" />
      </div>

      <div className="absolute bottom-3 left-3 rounded-xl bg-black/50 px-3.5 py-2.5 backdrop-blur">
        <p className="text-[12px] font-semibold text-[#F5F7F0]">Nearby Ayurvedic clinics</p>
        <p className="text-[11px] text-[#A9BCA6]">Hospitals · clinics · healthcare facilities</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Feature data                                                              */
/* -------------------------------------------------------------------------- */

type Tone = "light" | "dark" | "gold";

type Feature = {
  title: string;
  description: string;
  Icon: (p: { className?: string; strokeWidth?: number }) => ReactNode;
  span: string;
  tone: Tone;
  visual: ReactNode;
  wide?: boolean;
};

const features: Feature[] = [
  {
    title: "AI Ayurvedic Assistant",
    description:
      "Ask questions in natural language and explore structured Ayurvedic information through an intelligent conversational experience.",
    Icon: SparkleIcon,
    span: "md:col-span-2 lg:col-span-3",
    tone: "light",
    visual: <ChatVisual />,
  },
  {
    title: "Herb Identification",
    description:
      "Upload a herb image and use computer vision to identify the herb and explore its available Ayurvedic information.",
    Icon: LeafIcon,
    span: "md:col-span-2 lg:col-span-3",
    tone: "dark",
    visual: <ScanVisual />,
  },
  {
    title: "Knowledge Search",
    description:
      "Explore information about herbs, medicines, formulations, conditions, diet, lifestyle, precautions, and references.",
    Icon: SearchIcon,
    span: "md:col-span-1 lg:col-span-2",
    tone: "light",
    visual: <SearchVisual />,
  },
  {
    title: "Compare Information",
    description:
      "Compare herbs and medicines side by side to understand their documented characteristics and uses.",
    Icon: CompareIcon,
    span: "md:col-span-1 lg:col-span-2",
    tone: "dark",
    visual: <CompareVisual />,
  },
  {
    title: "Diet & Lifestyle",
    description:
      "Explore educational information about Ayurvedic diet, lifestyle practices, precautions, and supportive wellness guidance.",
    Icon: SunIcon,
    span: "md:col-span-2 lg:col-span-2",
    tone: "gold",
    visual: <DietVisual />,
  },
  {
    title: "Healthcare Locator",
    description:
      "Find nearby Ayurvedic hospitals, clinics, and healthcare facilities using location-based services.",
    Icon: PinIcon,
    span: "md:col-span-2 lg:col-span-6",
    tone: "dark",
    visual: <LocatorVisual />,
    wide: true,
  },
];

const tones: Record<
  Tone,
  { card: string; title: string; text: string; icon: string; glow: string }
> = {
  light: {
    card: "border border-[#DCE3CF] bg-white/85 shadow-[0_24px_70px_rgba(18,41,30,0.07)]",
    title: "text-[#12291E]",
    text: "text-[#5A6E61]",
    icon: "bg-[#E4EED5] text-[#2C6A4A]",
    glow: "rgba(44,106,74,0.10)",
  },
  dark: {
    card: "border border-white/10 bg-[#0F2A1D] shadow-[0_24px_70px_rgba(7,23,16,0.35)]",
    title: "text-[#F5F7F0]",
    text: "text-[#A9BCA6]",
    icon: "bg-white/10 text-[#F2CB6B]",
    glow: "rgba(242,203,107,0.14)",
  },
  gold: {
    card: "border border-[#EAD79A] bg-gradient-to-br from-[#FBF0CC] to-[#F2DDA0] shadow-[0_24px_70px_rgba(186,140,30,0.16)]",
    title: "text-[#3D2C05]",
    text: "text-[#6E5A25]",
    icon: "bg-white/60 text-[#8A5F0B]",
    glow: "rgba(255,255,255,0.45)",
  },
};

/* -------------------------------------------------------------------------- */
/*  Section                                                                   */
/* -------------------------------------------------------------------------- */

export default function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative overflow-hidden rounded-t-[44px] bg-[#F5F7F0] py-24 sm:py-28 lg:rounded-t-[64px] lg:py-36"
    >
      {/* soft dotted texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(18,41,30,0.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(to bottom, black, transparent 55%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 55%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="font-display max-w-[760px] text-[42px] font-light leading-[1.04] tracking-[-0.03em] text-[#12291E] sm:text-[56px] lg:text-[70px]">
            <LineReveal>Everything you need</LineReveal>
            <LineReveal delay={0.12}>to explore Ayurveda</LineReveal>
          </h2>

          <Reveal delay={0.15} className="max-w-[440px]">
            <p className="text-[16px] leading-8 text-[#5A6E61]">
              AyurvedAI brings Ayurvedic knowledge, intelligent AI, computer
              vision, comparison tools, and location services together in one
              platform.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-6">
          {features.map((f, i) => {
            const t = tones[f.tone];
            return (
              <Reveal key={f.title} delay={(i % 3) * 0.08} className={f.span}>
                <TiltCard
                  className="h-full"
                  cardClassName={`rounded-[32px] p-7 sm:p-9 ${t.card}`}
                  glow={t.glow}
                  intensity={f.wide ? 2.5 : 4}
                >
                  <div
                    className={
                      f.wide
                        ? "grid h-full gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"
                        : "flex h-full flex-col"
                    }
                  >
                    <div>
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${t.icon}`}
                      >
                        <f.Icon className="h-6 w-6" />
                      </span>

                      <h3
                        className={`font-display mt-7 text-[28px] font-normal leading-tight tracking-[-0.015em] sm:text-[30px] ${t.title}`}
                      >
                        {f.title}
                      </h3>

                      <p className={`mt-3.5 max-w-[520px] text-[15px] leading-7 ${t.text}`}>
                        {f.description}
                      </p>
                    </div>

                    <div className={f.wide ? "" : "mt-8 flex flex-1 flex-col justify-end"}>{f.visual}</div>
                  </div>
                </TiltCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}