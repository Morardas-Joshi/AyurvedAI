import { LineReveal, Reveal, TiltCard } from "./ui";
import { BanIcon, BookIcon, DocIcon, LeafIcon, ShieldIcon } from "./icons";

const points = [
  {
    title: "Educational Information",
    description:
      "AyurvedAI is designed to provide educational and informational content about Ayurveda.",
    Icon: BookIcon,
  },
  {
    title: "Not a Diagnosis System",
    description:
      "The platform does not diagnose diseases, predict medical conditions, or determine a user's medical condition.",
    Icon: BanIcon,
  },
  {
    title: "Not a Prescription System",
    description:
      "Information provided by the platform should not be treated as a personalized medical prescription or treatment plan.",
    Icon: DocIcon,
  },
  {
    title: "Herb Identification Only",
    description:
      "The confidence shown for herb image identification relates to image classification and does not represent medical diagnosis.",
    Icon: LeafIcon,
  },
];

function PointCard({
  point,
  delay,
}: {
  point: (typeof points)[number];
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <TiltCard
        cardClassName="rounded-[28px] border border-white/10 bg-white/[0.045] p-7 transition-colors duration-500 hover:bg-white/[0.075]"
        glow="rgba(242,203,107,0.14)"
        intensity={5}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E3A82B]/15 text-[#F2CB6B]">
          <point.Icon className="h-6 w-6" />
        </span>

        <h3 className="font-display mt-6 text-[24px] font-normal tracking-[-0.01em] text-[#F5F7F0]">
          {point.title}
        </h3>

        <p className="mt-3 text-[14.5px] leading-7 text-[#AFC0AC]">
          {point.description}
        </p>
      </TiltCard>
    </Reveal>
  );
}

export default function SafetySection() {
  const left = [points[0], points[2]];
  const right = [points[1], points[3]];

  return (
    <section
      id="safety"
      className="relative overflow-clip bg-[#0E2B1E] py-24 sm:py-28 lg:py-36"
    >
      <div className="pointer-events-none absolute -left-40 -top-32 h-[520px] w-[520px] rounded-full bg-[#2C6A4A]/35 blur-[150px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full bg-[#E3A82B]/[0.10] blur-[150px]" />

      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] gap-16 px-6 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20 lg:px-10">
        <div>
          {/* pulsing shield */}
          <div className="relative mb-10 h-24 w-24">
            {[0, 1].map((i) => (
              <span
                key={i}
                className="absolute inset-0 rounded-full border border-[#F2CB6B]/40"
                style={{ animation: `pulseRing 3.2s ease-out ${i * 1.4}s infinite` }}
              />
            ))}
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-[#F2CB6B] to-[#E3A82B] text-[#0C2419] shadow-[0_0_50px_rgba(227,168,43,0.35)]">
              <ShieldIcon className="h-11 w-11" strokeWidth={1.6} />
            </span>
          </div>

          <h2 className="font-display text-[42px] font-light leading-[1.04] tracking-[-0.03em] text-[#F5F7F0] sm:text-[56px] lg:text-[64px]">
            <LineReveal>Knowledge with</LineReveal>
            <LineReveal delay={0.12}>
              <span className="italic text-[#F2CB6B]">clear boundaries.</span>
            </LineReveal>
          </h2>

          <Reveal delay={0.15}>
            <p className="mt-7 max-w-[540px] text-[16px] leading-8 text-[#B5C6B2]">
              AyurvedAI is intended to make Ayurvedic information easier to
              explore while keeping the distinction between educational
              information and professional healthcare clear.
            </p>

            <div className="mt-8 max-w-[540px] rounded-r-2xl border-l-2 border-[#E3A82B] bg-white/[0.05] py-5 pl-6 pr-6">
              <p className="text-[14.5px] leading-7 text-[#D3DFCF]">
                Information provided by AyurvedAI should be used for
                educational purposes and should not replace consultation with a
                qualified healthcare professional.
              </p>
            </div>
          </Reveal>
        </div>

        {/* staggered columns */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-4">
            {left.map((p, i) => (
              <PointCard key={p.title} point={p} delay={i * 0.1} />
            ))}
          </div>

          <div className="grid content-start gap-4 sm:pt-14">
            {right.map((p, i) => (
              <PointCard key={p.title} point={p} delay={0.1 + i * 0.1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}