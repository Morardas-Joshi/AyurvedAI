import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "framer-motion";

import { EASE, LineReveal, Reveal } from "./ui";

const steps = [
  {
    number: "01",
    title: "Ask or Explore",
    description:
      "Ask your Ayurvedic question or choose the information you want to explore.",
    chips: ["Ask in your own words", "Or pick a topic"],
  },
  {
    number: "02",
    title: "AI Retrieves Knowledge",
    description:
      "The system retrieves relevant information from the Ayurvedic knowledge base.",
    chips: ["Ayurvedic knowledge base", "Relevant passages"],
  },
  {
    number: "03",
    title: "Understand the Answer",
    description:
      "AyurvedAI presents structured educational information with relevant references.",
    chips: ["Structured answer", "References included"],
  },
];

/** Slowly rotating mandala – the quiet 3D-ish anchor of the sticky panel */
function Mandala() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      <div className="absolute inset-0 rounded-full bg-[#E3A82B]/10 blur-3xl" />

      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full"
        style={{ animation: "spinSlow 60s linear infinite" }}
        fill="none"
      >
        <circle cx="100" cy="100" r="94" stroke="#E3A82B" strokeOpacity="0.3" strokeDasharray="2 7" />
        {Array.from({ length: 12 }).map((_, i) => (
          <ellipse
            key={i}
            cx="100"
            cy="52"
            rx="11"
            ry="38"
            transform={`rotate(${i * 30} 100 100)`}
            stroke="#9DBF7A"
            strokeOpacity="0.4"
          />
        ))}
      </svg>

      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full"
        style={{ animation: "spinSlow 38s linear infinite reverse" }}
        fill="none"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse
            key={i}
            cx="100"
            cy="64"
            rx="9"
            ry="28"
            transform={`rotate(${i * 45} 100 100)`}
            stroke="#F2CB6B"
            strokeOpacity="0.55"
          />
        ))}
        <circle cx="100" cy="100" r="14" fill="#F2CB6B" fillOpacity="0.9" />
        <circle cx="100" cy="100" r="22" stroke="#F2CB6B" strokeOpacity="0.4" />
      </svg>
    </div>
  );
}

export default function HowItWorksSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start 65%", "end 60%"],
  });

  const lineScale = useSpring(scrollYProgress, { stiffness: 90, damping: 26 });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(Math.min(steps.length - 1, Math.max(0, Math.floor(v * steps.length))));
  });

  return (
    <section
      id="how-it-works"
      className="relative overflow-clip bg-[#071710] py-24 sm:py-28 lg:py-36"
    >
      <div className="pointer-events-none absolute -right-40 top-0 h-[560px] w-[560px] rounded-full bg-[#2C6A4A]/25 blur-[150px]" />
      <div className="pointer-events-none absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[#E3A82B]/[0.08] blur-[140px]" />

      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] gap-16 px-6 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24 lg:px-10">
        {/* Sticky left panel */}
        <div className="lg:sticky lg:top-32 lg:self-start">
          <h2 className="font-display text-[42px] font-light leading-[1.04] tracking-[-0.03em] text-[#F5F7F0] sm:text-[56px] lg:text-[64px]">
            <LineReveal>From question</LineReveal>
            <LineReveal delay={0.12}>to knowledge</LineReveal>
          </h2>

          <Reveal delay={0.15}>
            <p className="mt-6 max-w-[460px] text-[16px] leading-8 text-[#9DB0A0]">
              AyurvedAI connects your questions with structured Ayurvedic
              knowledge through an AI-powered retrieval process.
            </p>
          </Reveal>

          <div className="mt-12 hidden lg:block">
            <Mandala />

            <div className="mt-8 flex items-baseline justify-center gap-3 text-[#F5F7F0]">
              <div className="relative h-[64px] w-[52px] overflow-hidden">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={active}
                    initial={{ y: 48, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -48, opacity: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="font-display absolute inset-0 text-center text-[54px] font-light leading-[64px] text-[#F2CB6B]"
                  >
                    {active + 1}
                  </motion.span>
                </AnimatePresence>
              </div>
              <span className="text-[15px] text-[#7E9583]">of {steps.length} steps</span>
            </div>
          </div>
        </div>

        {/* Scroll-driven timeline */}
        <div ref={trackRef} className="relative">
          <div className="absolute bottom-8 left-[19px] top-8 w-px bg-white/10">
            <motion.div
              style={{ scaleY: lineScale }}
              className="h-full w-full origin-top bg-gradient-to-b from-[#9DBF7A] to-[#E3A82B]"
            />
          </div>

          <div className="space-y-10 lg:space-y-16">
            {steps.map((step, i) => {
              const reached = i <= active;
              const current = i === active;

              return (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, x: 40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.9, ease: EASE }}
                  className="relative pl-14 sm:pl-16"
                >
                  {/* node on the line */}
                  <div
                    className={`absolute left-0 top-8 flex h-10 w-10 items-center justify-center rounded-full border text-[12px] font-bold transition-all duration-500 ${
                      reached
                        ? "border-[#F2CB6B] bg-[#F2CB6B] text-[#0C2419] shadow-[0_0_30px_rgba(242,203,107,0.4)]"
                        : "border-white/15 bg-[#0C2419] text-[#7E9583]"
                    }`}
                  >
                    {step.number}
                  </div>

                  <div
                    className={`relative overflow-hidden rounded-[30px] border p-7 transition-all duration-700 sm:p-10 lg:min-h-[280px] ${
                      current
                        ? "border-[#9DBF7A]/40 bg-white/[0.07] shadow-[0_0_90px_rgba(111,162,127,0.16)]"
                        : reached
                        ? "border-white/15 bg-white/[0.04]"
                        : "border-white/10 bg-white/[0.02] opacity-55"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="font-display pointer-events-none absolute right-6 top-3 hidden select-none text-[96px] sm:block font-light leading-none text-transparent"
                      style={{ WebkitTextStroke: "1px rgba(201,221,176,0.22)" }}
                    >
                      {step.number}
                    </span>

                    <h3 className="font-display relative text-[30px] font-normal tracking-[-0.015em] text-[#F5F7F0] sm:text-[36px]">
                      {step.title}
                    </h3>

                    <p className="relative mt-4 max-w-[480px] text-[15.5px] leading-8 text-[#A9BCA6]">
                      {step.description}
                    </p>

                    <div className="relative mt-8 flex flex-wrap gap-2.5">
                      {step.chips.map((c) => (
                        <span
                          key={c}
                          className="rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-[#C9DDB0]"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}