import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";

import { LineReveal, Magnetic, Reveal } from "./ui";
import { ArrowIcon, LeafIcon } from "./icons";

export default function CTASection() {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  /* The card grows into place as it scrolls into view */
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const radius = useTransform(scrollYProgress, [0, 1], [80, 44]);

  return (
    <section className="relative overflow-hidden bg-[#F5F7F0] px-4 py-20 sm:px-6 sm:py-28">
      <motion.div
        ref={ref}
        style={{ scale, borderRadius: radius }}
        className="relative mx-auto max-w-[1300px] overflow-hidden bg-[#0C2419] px-6 py-20 text-center sm:px-12 sm:py-28 lg:px-20"
      >
        {/* glows */}
        <div className="pointer-events-none absolute -left-32 top-0 h-[420px] w-[420px] rounded-full bg-[#2C6A4A]/45 blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full bg-[#E3A82B]/20 blur-[130px]" />

        {/* concentric rings */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -ml-[360px] -mt-[360px] h-[720px] w-[720px] rounded-full border border-white/[0.07]" />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -ml-[270px] -mt-[270px] h-[540px] w-[540px] rounded-full border border-dashed border-[#E3A82B]/25"
          style={{ animation: "spinSlow 70s linear infinite" }}
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -ml-[180px] -mt-[180px] h-[360px] w-[360px] rounded-full border border-[#9DBF7A]/20"
          style={{ animation: "spinSlow 50s linear infinite reverse" }}
        >
          <span className="absolute -top-1.5 left-1/2 -ml-1.5 h-3 w-3 rounded-full bg-[#F2CB6B] shadow-[0_0_20px_#F2CB6B]" />
        </div>

        {/* floating leaves */}
        {[
          { left: "9%", top: "20%", size: 34, dur: 9, delay: 0 },
          { left: "88%", top: "26%", size: 26, dur: 11, delay: 1.2 },
          { left: "80%", top: "78%", size: 38, dur: 10, delay: 0.5 },
          { left: "14%", top: "72%", size: 24, dur: 12, delay: 2 },
        ].map((l, i) => (
          <svg
            key={i}
            width={l.size}
            height={l.size}
            viewBox="0 0 24 24"
            className="pointer-events-none absolute"
            style={{
              left: l.left,
              top: l.top,
              animation: `drift ${l.dur}s ease-in-out ${l.delay}s infinite`,
            }}
          >
            <path
              d="M12 3c3.8 2.2 6.2 5.2 6.2 9.1 0 4.8-3.1 8.1-6.2 8.1s-6.2-3.3-6.2-8.1C5.8 8.2 8.2 5.2 12 3Z"
              fill={i % 2 === 0 ? "#9DBF7A" : "#F2CB6B"}
              fillOpacity="0.55"
            />
          </svg>
        ))}

        <div className="relative z-10 mx-auto max-w-[820px]">
          <h2 className="font-display text-[42px] font-light leading-[1.04] tracking-[-0.03em] text-[#F5F7F0] sm:text-[58px] lg:text-[72px]">
            <LineReveal>Begin your journey into</LineReveal>
            <LineReveal delay={0.12}>
              <span className="bg-gradient-to-r from-[#C9DDB0] via-[#F2CB6B] to-[#E3A82B] bg-clip-text pr-2 italic text-transparent">
                Ayurvedic knowledge
              </span>
            </LineReveal>
          </h2>

          <Reveal delay={0.15}>
            <p className="mx-auto mt-7 max-w-[600px] text-[16px] leading-8 text-[#A9BCA6]">
              Ask questions, explore herbs and medicines, compare information,
              and discover Ayurvedic knowledge with AyurvedAI.
            </p>
          </Reveal>

          <Reveal delay={0.25} className="mt-11">
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Magnetic>
                <button
                  type="button"
                  onClick={() => navigate("/chat")}
                  className="group relative inline-flex h-16 items-center gap-3 overflow-hidden rounded-full bg-gradient-to-r from-[#F2CB6B] to-[#E3A82B] px-10 text-[16px] font-bold text-[#0C2419] shadow-[0_16px_50px_rgba(227,168,43,0.32)] transition-shadow duration-300 hover:shadow-[0_20px_64px_rgba(227,168,43,0.5)]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/40 blur-md"
                    style={{ animation: "shine 3.6s ease-in-out infinite" }}
                  />
                  <span className="relative">Ask AyurvedAI</span>
                  <ArrowIcon
                    className="relative h-5 w-5 transition-transform duration-300 group-hover:translate-x-1.5"
                    strokeWidth={2.2}
                  />
                </button>
              </Magnetic>

              <Magnetic strength={0.2}>
                <button
                  type="button"
                  onClick={() => navigate("/chat")}
                  className="inline-flex h-16 items-center gap-3 rounded-full border border-white/20 bg-white/[0.05] px-9 text-[16px] font-semibold text-[#EAF1E4] transition-colors duration-300 hover:border-[#F2CB6B]/60 hover:bg-white/10"
                >
                  <LeafIcon className="h-5 w-5 text-[#9DBF7A]" />
                  Identify Herb
                </button>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </motion.div>
    </section>
  );
}