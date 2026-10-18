import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

// import logo from "../../assets/ayurvedAI_logo.png";
import home_harb_img from "../../assets/home_hearb_img.png";
import { EASE, LineReveal, Marquee } from "./ui";
import { ArrowIcon, CheckIcon, LeafIcon, PinIcon, SparkleIcon } from "./icons";

const MARQUEE_ITEMS = [
  "Herbs",
  "Formulations",
  "Medicines",
  "Diet",
  "Lifestyle",
  "Precautions",
  "References",
  "Herb identification",
  "Healthcare locator",
];

/* Small leaves floating at different depths inside the 3D stage */
const LEAVES = [
  { left: "8%", top: "16%", z: -60, size: 26, dur: 9, delay: 0, color: "#9DBF7A" },
  { left: "82%", top: "12%", z: 140, size: 20, dur: 11, delay: 1.5, color: "#F2CB6B" },
  { left: "90%", top: "70%", z: -30, size: 30, dur: 10, delay: 0.6, color: "#6FA27F" },
  { left: "14%", top: "78%", z: 90, size: 18, dur: 12, delay: 2.2, color: "#C9DDB0" },
  { left: "50%", top: "3%", z: 60, size: 16, dur: 8, delay: 3, color: "#9DBF7A" },
  { left: "64%", top: "92%", z: 180, size: 22, dur: 13, delay: 1, color: "#F2CB6B" },
];

function GlassCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`rounded-2xl border border-white/15 bg-[#12301F]/85 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.4)] ${className}`}
    >
      {children}
    </div>
  );
}

export default function HeroSection() {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement>(null);

  /* Scroll parallax: text drifts down + fades, scene drifts up */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const textY = useTransform(scrollYProgress, [0, 1], [0, 110]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const glowY = useTransform(scrollYProgress, [0, 1], [0, 160]);

  /* Mouse-driven 3D rotation for the scene */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-16, 16]), {
    stiffness: 70,
    damping: 16,
  });
  const rotX = useSpring(useTransform(my, [-0.5, 0.5], [12, -12]), {
    stiffness: 70,
    damping: 16,
  });

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const handleLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <section
      id="home"
      ref={sectionRef}
      className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[#071710]"
    >
      {/* ------------------------------ background ----------------------------- */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          style={{ y: glowY }}
          className="absolute -left-40 top-10 h-[560px] w-[560px] rounded-full bg-[#2C6A4A]/35 blur-[140px]"
        />
        <motion.div
          style={{ y: glowY }}
          className="absolute -right-32 top-[30%] h-[520px] w-[520px] rounded-full bg-[#E3A82B]/[0.14] blur-[150px]"
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 60% 45%, black, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 60% 45%, black, transparent 75%)",
          }}
        />
      </div>

      {/* -------------------------------- content ------------------------------ */}
      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] flex-1 items-center gap-4 px-6 pb-14 pt-32 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-6 lg:px-10">
        {/* Left – copy */}
        <motion.div style={{ y: textY, opacity: textOpacity }} className="max-w-[700px]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
            className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-[#E3A82B]/30 bg-[#E3A82B]/10 py-2 pl-3 pr-4"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F2CB6B] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F2CB6B]" />
            </span>
            <span className="text-[13px] font-semibold text-[#F2CB6B]">
              Intelligent Ayurvedic knowledge
            </span>
          </motion.div>

          <h1 className="font-display text-[50px] font-light leading-[1.02] tracking-[-0.03em] text-[#F5F7F0] sm:text-[66px] lg:text-[76px] xl:text-[88px]">
            <LineReveal onMount delay={0.3}>
              Explore Ayurveda
            </LineReveal>
            <LineReveal onMount delay={0.45}>
              <span className="bg-gradient-to-r from-[#C9DDB0] via-[#F2CB6B] to-[#E3A82B] bg-clip-text pr-2 italic text-transparent">
                with intelligent AI
              </span>
            </LineReveal>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.75, ease: EASE }}
            className="mt-8 max-w-[560px] text-[16px] leading-8 text-[#A9BCA6] sm:text-[17px]"
          >
            Discover trusted Ayurvedic knowledge through intelligent
            conversations, herb identification, and structured health
            information — all in one place.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.9, ease: EASE }}
            className="mt-10 flex flex-col gap-3 sm:flex-row"
          >
            <button
              type="button"
              onClick={() => navigate("/chat")}
              className="group relative flex h-14 items-center justify-center gap-3 overflow-hidden rounded-full bg-gradient-to-r from-[#F2CB6B] to-[#E3A82B] px-8 text-[15px] font-bold text-[#0C2419] shadow-[0_14px_44px_rgba(227,168,43,0.28)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_54px_rgba(227,168,43,0.4)]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/40 blur-md"
                style={{ animation: "shine 3.6s ease-in-out infinite" }}
              />
              <span className="relative">Ask AyurvedAI</span>
              <ArrowIcon
                className="relative h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1"
                strokeWidth={2.2}
              />
            </button>

            <button
              type="button"
              onClick={() => navigate("/chat")}
              className="flex h-14 items-center justify-center gap-3 rounded-full border border-white/20 bg-white/[0.05] px-8 text-[15px] font-semibold text-[#EAF1E4] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[#F2CB6B]/60 hover:bg-white/10"
            >
              <LeafIcon className="h-5 w-5 text-[#9DBF7A]" />
              Identify Herb
            </button>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.15 }}
            className="mt-12 flex flex-wrap gap-x-7 gap-y-3 text-[13px] text-[#8FA593]"
          >
            {["Trusted knowledge", "Source-based answers", "Educational information"].map(
              (t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 text-[#9DBF7A]" strokeWidth={2.4} />
                  {t}
                </li>
              )
            )}
          </motion.ul>
        </motion.div>

        {/* Right – 3D stage */}
        <motion.div
          style={{ y: sceneY }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, delay: 0.3, ease: EASE }}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          className="relative h-[400px] w-full sm:h-[540px] lg:h-[660px]"
        >
          <div
            className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 scale-[0.62] sm:scale-[0.86] lg:scale-100"
            style={{ perspective: 1500 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{
                rotateX: rotX,
                rotateY: rotY,
                transformStyle: "preserve-3d",
              }}
            >
              {/* deep glow */}
              <div
                className="absolute left-1/2 top-1/2 -ml-[220px] -mt-[220px] h-[440px] w-[440px] rounded-full bg-[#2C6A4A]/50 blur-[90px]"
                style={{ transform: "translateZ(-140px)" }}
              />

              {/* 3D orbit rings */}
              <div
                className="absolute left-1/2 top-1/2 -ml-[220px] -mt-[220px] h-[440px] w-[440px] rounded-full border border-[#C9DDB0]/35"
                style={{ animation: "ringA 22s linear infinite" }}
              >
                <span className="absolute -top-2 left-1/2 -ml-2 h-4 w-4 rounded-full bg-[#F2CB6B] shadow-[0_0_24px_#F2CB6B]" />
              </div>

              <div
                className="absolute left-1/2 top-1/2 -ml-[265px] -mt-[265px] h-[530px] w-[530px] rounded-full border border-dashed border-[#E3A82B]/35"
                style={{ animation: "ringB 34s linear infinite" }}
              >
                <span className="absolute -bottom-1.5 left-1/2 -ml-1.5 h-3 w-3 rounded-full bg-[#9DBF7A] shadow-[0_0_20px_#9DBF7A]" />
              </div>

              <div
                className="absolute left-1/2 top-1/2 -ml-[170px] -mt-[170px] h-[340px] w-[340px] rounded-full border border-white/20"
                style={{ animation: "ringC 16s linear infinite" }}
              >
                <span className="absolute -right-1.5 top-1/2 -mt-1.5 h-3 w-3 rounded-full bg-white shadow-[0_0_18px_#fff]" />
              </div>

              {/* core orb */}
              <div
                className="absolute left-1/2 top-1/2 -ml-[130px] -mt-[130px] flex h-[260px] w-[260px] items-center justify-center rounded-full"
                style={{
                  transform: "translateZ(50px)",
                  background:
                    "radial-gradient(circle at 32% 26%, #3F9663 0%, #1E5238 38%, #0E2A1C 72%, #071710 100%)",
                  boxShadow:
                    "0 0 100px rgba(111,162,127,0.35), inset -22px -32px 64px rgba(0,0,0,0.5), inset 14px 16px 44px rgba(201,221,176,0.2)",
                }}
              >
                <div
                  aria-hidden
                  className="absolute left-[18%] top-[12%] h-[26%] w-[38%] rounded-full bg-white/15 blur-xl"
                />

                {/* Brand seal – your logo, floating in the centre of the orb */}
                <div
                  className="relative"
                  style={{ animation: "float 7s ease-in-out infinite" }}
                >
                  <span
                    aria-hidden
                    className="absolute -inset-3 rounded-full border border-[#F2CB6B]/50"
                    style={{ animation: "pulseRing 3.6s ease-out infinite" }}
                  />
                  <span
                    aria-hidden
                    className="absolute -inset-3 rounded-full border border-[#F2CB6B]/30"
                    style={{ animation: "pulseRing 3.6s ease-out 1.8s infinite" }}
                  />
                  <div className="flex h-[600px] w-[600px] items-center justify-center ">
                    <img
                      src={home_harb_img}
                      alt="AyurvedAI herb"
                      draggable={false}
                      className="h-full w-full select-none rounded-full object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* floating leaves */}
              {LEAVES.map((l, i) => (
                <div
                  key={i}
                  className="absolute"
                  style={{ left: l.left, top: l.top, transform: `translateZ(${l.z}px)` }}
                >
                  <svg
                    width={l.size}
                    height={l.size}
                    viewBox="0 0 24 24"
                    style={{ animation: `drift ${l.dur}s ease-in-out ${l.delay}s infinite` }}
                  >
                    <path
                      d="M12 3c3.8 2.2 6.2 5.2 6.2 9.1 0 4.8-3.1 8.1-6.2 8.1s-6.2-3.3-6.2-8.1C5.8 8.2 8.2 5.2 12 3Z"
                      fill={l.color}
                      fillOpacity="0.85"
                    />
                  </svg>
                </div>
              ))}

              {/* glass card — herb identification */}
              <div className="absolute left-[-2%] top-[12%]" style={{ transform: "translateZ(150px)" }}>
                <GlassCard
                  className="w-[210px]"
                  style={{ animation: "float 7s ease-in-out infinite" }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#9DBF7A]/20 text-[#C9DDB0]">
                      <LeafIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-[#8FA593]">Herb identified</p>
                      <p className="text-[14px] font-semibold text-[#F5F7F0]">Holy Basil (Tulsi)</p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "92%" }}
                      transition={{ duration: 1.6, delay: 1.4, ease: EASE }}
                      className="h-full rounded-full bg-gradient-to-r from-[#9DBF7A] to-[#F2CB6B]"
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-[#8FA593]">Image match · sample preview</p>
                </GlassCard>
              </div>

              {/* glass card — chat */}
              <div className="absolute right-[-8%] top-[40%]" style={{ transform: "translateZ(110px)" }}>
                <GlassCard
                  className="w-[230px]"
                  style={{ animation: "float 8s ease-in-out 1s infinite" }}
                >
                  <div className="flex items-center gap-2 text-[11px] font-medium text-[#F2CB6B]">
                    <SparkleIcon className="h-4 w-4" />
                    AyurvedAI
                  </div>
                  <p className="mt-2 text-[13px] leading-5 text-[#DCE8D6]">
                    Here&apos;s a structured overview of Triphala with its documented uses.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-[#C9DDB0]">
                      Formulation
                    </span>
                    <span className="rounded-full bg-[#E3A82B]/15 px-2.5 py-1 text-[10px] font-medium text-[#F2CB6B]">
                      3 references
                    </span>
                  </div>
                </GlassCard>
              </div>

              {/* glass card — locator */}
              <div className="absolute bottom-[8%] left-[4%]" style={{ transform: "translateZ(90px)" }}>
                <GlassCard
                  className="flex w-[220px] items-center gap-3"
                  style={{ animation: "float 9s ease-in-out 0.4s infinite" }}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E3A82B]/15 text-[#F2CB6B]">
                    <PinIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-[#F5F7F0]">Nearby clinics</p>
                    <p className="text-[11px] text-[#8FA593]">Location-based search</p>
                  </div>
                </GlassCard>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* ------------------------------- marquee ------------------------------- */}
      <div className="relative z-10 border-y border-white/10 bg-white/[0.03] py-4 text-[14px] font-medium tracking-wide text-[#8FA593]">
        <Marquee items={MARQUEE_ITEMS} />
      </div>
    </section>
  );
}