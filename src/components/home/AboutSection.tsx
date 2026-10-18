import { Fragment } from "react";

import { LineReveal, Reveal, TiltCard } from "./ui";
import { ArrowIcon, LeafIcon, PinIcon, SparkleIcon } from "./icons";

const pillars = [
  {
    title: "Generative AI + RAG",
    description:
      "Conversational AI retrieves relevant information from a curated knowledge base before generating an answer.",
    Icon: SparkleIcon,
    flow: ["Question", "Retrieve", "Answer"],
  },
  {
    title: "Computer Vision",
    description:
      "Image-based herb identification helps users explore herbs from visual input.",
    Icon: LeafIcon,
    flow: ["Image", "Classify", "Herb"],
  },
  {
    title: "Location Services",
    description:
      "Location-based services help users discover nearby Ayurvedic healthcare facilities.",
    Icon: PinIcon,
    flow: ["Location", "Search", "Nearby"],
  },
];

const stack = [
  { short: "RAG", long: "Retrieval-Augmented Generation" },
  { short: "CV", long: "Computer Vision" },
  { short: "MAP", long: "Location Services" },
];

export default function AboutSection() {
  return (
    <section
      id="about"
      className="relative overflow-clip bg-[#E9EFE0] py-24 sm:py-28 lg:py-36"
    >
      {/* giant decorative rings */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[260px] -top-[260px] h-[700px] w-[700px] rounded-full border border-[#2C6A4A]/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[180px] -top-[180px] h-[540px] w-[540px] rounded-full border border-[#2C6A4A]/10"
      />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 sm:px-8 lg:px-10">
        <div className="grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20">
          {/* left — sticky story */}
          <div className="lg:sticky lg:top-32 lg:self-start">
            <h2 className="font-display text-[42px] font-light leading-[1.04] tracking-[-0.03em] text-[#12291E] sm:text-[56px] lg:text-[68px]">
              <LineReveal>More than a chatbot.</LineReveal>
              <LineReveal delay={0.12}>
                <span className="italic text-[#2C6A4A]">A knowledge system.</span>
              </LineReveal>
            </h2>

            <Reveal delay={0.15}>
              <p className="mt-8 max-w-[560px] text-[16px] leading-8 text-[#55695B]">
                AyurvedAI is an AI-powered Ayurvedic Knowledge &amp; Healthcare
                Information System designed to bring structured Ayurvedic
                information and modern AI technologies together in one platform.
              </p>

              <p className="mt-5 max-w-[560px] text-[16px] leading-8 text-[#55695B]">
                The platform combines conversational AI, Retrieval-Augmented
                Generation, computer vision, comparison tools, and location
                services to make Ayurvedic information easier to explore.
              </p>
            </Reveal>
          </div>

          {/* right — offset tilt cards */}
          <div className="grid gap-5">
            {pillars.map((p, i) => (
              <Reveal
                key={p.title}
                delay={0.05}
                className={i % 2 === 1 ? "lg:ml-14" : "lg:mr-14"}
              >
                <TiltCard
                  cardClassName="rounded-[30px] border border-[#D3DCC4] bg-white/80 p-7 shadow-[0_24px_70px_rgba(18,41,30,0.08)] sm:p-9"
                  glow="rgba(227,168,43,0.16)"
                  intensity={4}
                >
                  <div className="flex items-start gap-5">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#12291E] text-[#F2CB6B]">
                      <p.Icon className="h-7 w-7" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-[26px] font-normal leading-tight tracking-[-0.015em] text-[#12291E] sm:text-[30px]">
                        {p.title}
                      </h3>

                      <p className="mt-3 max-w-[460px] text-[15px] leading-7 text-[#5A6E61]">
                        {p.description}
                      </p>

                      <div className="mt-6 flex flex-wrap items-center gap-2">
                        {p.flow.map((step, idx) => (
                          <Fragment key={step}>
                            <span className="rounded-full bg-[#E4EED5] px-3.5 py-1.5 text-[12px] font-semibold text-[#2C6A4A]">
                              {step}
                            </span>
                            {idx < p.flow.length - 1 && (
                              <ArrowIcon className="h-3.5 w-3.5 text-[#E3A82B]" strokeWidth={2.2} />
                            )}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>

        {/* tech strip */}
        <Reveal className="mt-20 lg:mt-28">
          <div className="grid overflow-hidden rounded-[36px] bg-[#0C2419] sm:grid-cols-3">
            {stack.map((s, i) => (
              <div
                key={s.short}
                className={`group relative px-8 py-12 text-center transition-colors duration-500 hover:bg-[#12301F] sm:py-16 ${
                  i > 0 ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""
                }`}
              >
                <div className="font-display bg-gradient-to-b from-[#F5F7F0] to-[#9DBF7A] bg-clip-text text-[64px] font-light leading-none tracking-[-0.03em] text-transparent transition-transform duration-500 group-hover:scale-105 sm:text-[84px]">
                  {s.short}
                </div>
                <p className="mt-4 text-[14px] text-[#93A99A]">{s.long}</p>
                <span className="mx-auto mt-6 block h-px w-10 bg-[#E3A82B] transition-all duration-500 group-hover:w-20" />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}