import type { MouseEvent } from "react";

import logo from "../../assets/ayurvedAI_logo.png";
import { Reveal } from "./ui";
import { scrollToId } from "./smoothScroll";

const links = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How It Works" },
  { id: "about", label: "About" },
  { id: "safety", label: "Safety" },
];

const platform = [
  "AI Assistant",
  "Herb Identification",
  "Knowledge Search",
  "Comparison",
  "Diet & Lifestyle",
  "Healthcare Locator",
];

export default function FooterSection() {
  const go = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    scrollToId(id);
  };

  return (
    <footer className="relative overflow-hidden bg-[#050F0A] text-[#DCE8D1]">
      <div className="pointer-events-none absolute -left-32 top-0 h-[400px] w-[400px] rounded-full bg-[#2C6A4A]/20 blur-[140px]" />

      <div className="relative mx-auto w-full max-w-[1400px] px-6 pt-20 sm:px-8 lg:px-10">
        <div className="grid gap-14 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <a
              href="#home"
              onClick={go("home")}
              className="inline-flex items-center gap-3"
            >
              <span className="flex h-16 w-16 items-center justify-center overflow-hidden">
                <img
                  src={logo}
                  alt="AyurvedAI"
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="font-display text-[28px] font-normal tracking-tight text-[#F5F7F0]">
                AyurvedAI
              </span>
            </a>

            <p className="mt-6 max-w-[430px] text-[14.5px] leading-7 text-[#8FA593]">
              An AI-Powered Ayurvedic Knowledge &amp; Healthcare Information
              System designed to make Ayurvedic information easier to explore.
            </p>
          </div>

          <div>
            <h4 className="text-[14px] font-semibold text-[#F2CB6B]">Explore</h4>

            <div className="mt-5 flex flex-col gap-3 text-[14.5px] text-[#9DB0A0]">
              {links.map((l) => (
                <a
                  key={l.id}
                  href={`#${l.id}`}
                  onClick={go(l.id)}
                  className="w-fit transition-all duration-300 hover:translate-x-1 hover:text-white"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[14px] font-semibold text-[#F2CB6B]">Platform</h4>

            <div className="mt-5 flex flex-col gap-3 text-[14.5px] text-[#9DB0A0]">
              {platform.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-white/10 pt-7">
          <div className="flex flex-col gap-4 text-[12.5px] leading-6 text-[#7E9583] md:flex-row md:items-center md:justify-between">
            <p>© 2026 AyurvedAI. All rights reserved.</p>

            <p className="max-w-[650px] md:text-right">
              AyurvedAI provides educational information and is not intended for
              diagnosis, prescription, emergency treatment, or replacing
              professional healthcare consultation.
            </p>
          </div>
        </div>

        {/* giant wordmark */}
        <Reveal y={60}>
          <div
            aria-hidden
            className="font-display pointer-events-none -mb-[3.2vw] mt-10 select-none text-center text-[19vw] font-light leading-[0.9] tracking-[-0.04em] text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(201,221,176,0.22), rgba(201,221,176,0))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}
          >
            AyurvedAI
          </div>
        </Reveal>
      </div>
    </footer>
  );
}