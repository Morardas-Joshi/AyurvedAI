import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";

import logo from "./assets/ayurvedAI_logo.png";

import HeroSection from "./components/home/HeroSection";
import FeaturesSection from "./components/home/FeaturesSection";
import HowItWorksSection from "./components/home/HowItWorksSection";
import AboutSection from "./components/home/AboutSection";
import SafetySection from "./components/home/SafetySection";
import LifestyleTip from "./components/home/LifestyleTip";
import CTASection from "./components/home/CTASection";
import FooterSection from "./components/home/FooterSection";

import { ProfileAvatar, loadUser } from "./components/home/Avatars";
import { setLenis, scrollToId } from "./components/home/smoothScroll";
import { EASE } from "./components/home/ui";
import {
  ArrowIcon,
  CloseIcon,
  LogoutIcon,
  MenuIcon,
} from "./components/home/icons";

const NAV = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How It Works" },
  { id: "about", label: "About" },
  { id: "safety", label: "Safety" },
];


function Home() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const [showProfile, setShowProfile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("home");
  const profileRef = useRef<HTMLDivElement>(null);

  /* ------------------------------ user profile ----------------------------- */
  const user = useMemo(() => loadUser(), []);

  const userName = user.name || "User";
  const userEmail = user.email || "";
  const userRole = user.role || "User";

  const handleLogout = () => {
    localStorage.removeItem("ayurvedai_user");
    navigate("/login");
  };

  /* --------------------------- smooth scrolling ---------------------------- */
  useEffect(() => {
    if (reduceMotion) return;

    const lenis = new Lenis({
      duration: 1.25,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
    });

    setLenis(lenis);

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      setLenis(null);
    };
  }, [reduceMotion]);

  /* ------------------------ scroll progress + navbar ----------------------- */
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 28,
    restDelta: 0.001,
  });

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  /* ------------------------------ active section --------------------------- */
  useEffect(() => {
    const els = NAV.map((n) => document.getElementById(n.id)).filter(
      Boolean
    ) as HTMLElement[];

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* --------------------------- click outside profile ----------------------- */
  useEffect(() => {
    const onDown = (e: globalThis.MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setShowProfile(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setMenuOpen(false);
    scrollToId(id);
  };

  return (
    <div className="relative min-h-screen bg-[#071710] text-[#12291E]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Manrope:wght@400;500;600;700&display=swap');

        body {
          margin: 0;
          font-family: 'Manrope', system-ui, sans-serif;
          background: #071710;
          -webkit-font-smoothing: antialiased;
        }

        .font-display { font-family: 'Fraunces', serif; }

        ::selection { background: #F2CB6B; color: #0C2419; }

        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: #071710; }
        ::-webkit-scrollbar-thumb { background: #2C6A4A; border-radius: 999px; }

        @keyframes ringA {
          from { transform: rotateX(74deg) rotateZ(0deg); }
          to   { transform: rotateX(74deg) rotateZ(360deg); }
        }
        @keyframes ringB {
          from { transform: rotateX(62deg) rotateY(28deg) rotateZ(0deg); }
          to   { transform: rotateX(62deg) rotateY(28deg) rotateZ(-360deg); }
        }
        @keyframes ringC {
          from { transform: rotateY(70deg) rotateZ(0deg); }
          to   { transform: rotateY(70deg) rotateZ(360deg); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-14px); }
        }
        @keyframes drift {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33%      { transform: translate(10px, -18px) rotate(14deg); }
          66%      { transform: translate(-8px, -8px) rotate(-10deg); }
        }
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes scan {
          0%, 100% { top: 10%; }
          50%      { top: 86%; }
        }
        @keyframes dot {
          0%, 80%, 100% { transform: translateY(0); opacity: .4; }
          40%           { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes spinSlow {
          to { transform: rotate(360deg); }
        }
        @keyframes pulseRing {
          0%   { transform: scale(.7); opacity: .65; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @keyframes shine {
          0%   { transform: translateX(-120%) skewX(-20deg); }
          60%, 100% { transform: translateX(260%) skewX(-20deg); }
        }
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>

      {/* Scroll progress */}
      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-[#2C6A4A] via-[#9DBF7A] to-[#E3A82B]"
      />

      {/* ------------------------------- Header ------------------------------ */}
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.1, ease: EASE }}
        className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4"
      >
        <div
          className={`mx-auto flex items-center justify-between rounded-full border border-white/10 bg-[#0C2419]/90 py-2 pl-2.5 pr-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition-[max-width] duration-500 ease-out ${
            scrolled ? "max-w-[1040px]" : "max-w-[1280px]"
          }`}
        >
          <a
            href="#home"
            onClick={go("home")}
            className="flex items-center gap-2.5 rounded-full pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2CB6B]"
          >
            {/* Logo sits on a light chip so it stays visible on the dark bar */}
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden ">
              <img
                src={logo}
                alt="AyurvedAI"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="font-display hidden text-[20px] font-medium tracking-tight text-[#F5F7F0] sm:block">
              AyurvedAI
            </span>
          </a>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => {
              const isActive = active === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={go(item.id)}
                  className={`relative isolate rounded-full px-4 py-2 text-[13px] font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2CB6B] ${
                    isActive
                      ? "text-[#0C2419]"
                      : "text-[#BFD0B8] hover:text-white"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-[#F2CB6B]"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/chat")}
              className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-[#F2CB6B] to-[#E3A82B] px-5 py-2.5 text-[13px] font-bold text-[#0C2419] transition hover:brightness-110 sm:inline-flex"
            >
              Ask AyurvedAI
              <ArrowIcon className="h-4 w-4" strokeWidth={2.2} />
            </button>

            {/* Profile */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                aria-label="Open profile menu"
                aria-expanded={showProfile}
                onClick={() => setShowProfile((v) => !v)}
                className="rounded-full ring-1 ring-white/20 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2CB6B]"
              >
                <ProfileAvatar
                  value={user.avatar}
                  name={userName}
                  className="h-11 w-11 text-sm"
                />
              </button>

              <AnimatePresence>
                {showProfile && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="absolute right-0 top-[calc(100%+14px)] w-64 origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-[#0C2419]/95 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
                  >
                    <button
                      type="button"
                      onClick={() => navigate("/profile")}
                      className="block w-full border-b border-white/10 px-5 py-4 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F2CB6B]">
                      <span className="block font-semibold text-[#F5F7F0]">{userName}</span>

                      {userEmail && (
                        <span className="mt-1 block truncate text-sm text-[#93A99A]">
                          {userEmail}
                        </span>
                      )}

                      <span className="mt-3 inline-block rounded-full bg-[#E3A82B]/15 px-2.5 py-1 text-xs font-semibold text-[#F2CB6B]">
                        {userRole}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left text-sm font-semibold text-[#FF9C8F] transition hover:bg-white/5"
                    >
                      <LogoutIcon className="h-4 w-4" />
                      Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-[#F5F7F0] transition hover:bg-white/10 lg:hidden"
            >
              {menuOpen ? (
                <CloseIcon className="h-5 w-5" />
              ) : (
                <MenuIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="mx-auto mt-2 max-w-[1280px] rounded-3xl border border-white/10 bg-[#0C2419]/95 p-3 backdrop-blur-2xl lg:hidden"
            >
              {NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={go(item.id)}
                  className={`block rounded-2xl px-5 py-3.5 text-[15px] font-semibold transition ${
                    active === item.id
                      ? "bg-[#F2CB6B] text-[#0C2419]"
                      : "text-[#D5E2CE] hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </a>
              ))}

              <button
                type="button"
                onClick={() => navigate("/chat")}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F2CB6B] to-[#E3A82B] px-5 py-3.5 text-[15px] font-bold text-[#0C2419]"
              >
                Ask AyurvedAI
                <ArrowIcon className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      <main>
        <HeroSection />
        <FeaturesSection />
        <LifestyleTip userKey={String((user as unknown as Record<string, unknown>).id ?? userEmail ?? "guest")} />
        <HowItWorksSection />
        <AboutSection />
        <SafetySection />
        <CTASection />
      </main>

      <FooterSection />
    </div>
  );
}

export default Home;