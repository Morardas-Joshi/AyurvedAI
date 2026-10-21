import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import logo from "../../assets/ayurvedAI_logo.png";
import { EASE } from "./ui";
import { ArrowIcon, CheckIcon, LogoutIcon } from "./icons";
import {
  AVATARS,
  ProfileAvatar,
  loadUser,
  saveUser,
} from "./Avatars";

export default function UserProfile() {
  const navigate = useNavigate();

  const [stored] = useState(loadUser);
  const [avatar, setAvatar] = useState<string | undefined>(stored.avatar);
  const [savedAt, setSavedAt] = useState(0);

  const name = stored.name || "User";
  const email = stored.email || "";
  const role = stored.role || "User";
  const dirty = avatar !== stored.avatar;

  const selectedDef = AVATARS.find((a) => a.id === avatar);
  const previewLabel = selectedDef?.label ?? "Initials";

  const handleSave = () => {
    saveUser({ ...stored, avatar });
    setSavedAt(Date.now());
    setTimeout(() => navigate("/"), 900);
  };

  const handleLogout = () => {
    localStorage.removeItem("ayurvedai_user");
    navigate("/login");
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#071710] px-4 pb-6 pt-4 text-[#F5F7F0] sm:px-8 lg:h-screen lg:overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Manrope:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', serif; }
        .profile-root { font-family: 'Manrope', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
        .pf-scroll { scrollbar-width: thin; scrollbar-color: rgba(242,203,107,.4) transparent; }
        .pf-scroll::-webkit-scrollbar { width: 6px; }
        .pf-scroll::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
        .pf-scroll::-webkit-scrollbar-thumb { background: rgba(242,203,107,.35); border-radius: 999px; }
        .pf-scroll::-webkit-scrollbar-thumb:hover { background: rgba(242,203,107,.7); }
        @keyframes pf-spin { to { transform: rotate(360deg); } }
        @keyframes pf-pulse { 0% { transform: scale(.85); opacity: .6; } 100% { transform: scale(1.35); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
        }
      `}</style>

      {/* background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-0 h-[520px] w-[520px] rounded-full bg-[#2C6A4A]/35 blur-[140px]" />
        <div className="absolute -right-32 top-[35%] h-[480px] w-[480px] rounded-full bg-[#E3A82B]/[0.13] blur-[150px]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage:
              "radial-gradient(ellipse 70% 55% at 50% 30%, black, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 55% at 50% 30%, black, transparent 75%)",
          }}
        />
      </div>

      <div className="profile-root relative z-10 mx-auto flex min-h-0 w-full max-w-[1080px] flex-1 flex-col">
        {/* top bar */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="flex items-center justify-between rounded-full border border-white/10 bg-[#0C2419]/90 py-2 pl-2.5 pr-3 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-2xl"
        >
          <button
            type="button"
            onClick={() => navigate("/")}
            className="group flex items-center gap-2.5 rounded-full pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2CB6B]"
          >
            <img src={logo} alt="AyurvedAI" className="h-11 w-11 object-contain" />
            <span className="font-display hidden text-[20px] font-medium tracking-tight sm:block">
              AyurvedAI
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[13px] font-semibold text-[#D5E2CE] transition hover:border-[#F2CB6B]/60 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2CB6B]"
          >
            <ArrowIcon className="h-4 w-4 rotate-180" strokeWidth={2.2} />
            Back to home
          </button>
        </motion.div>

        <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_1fr] lg:grid-rows-1">
          {/* ------------------------- identity card ------------------------ */}
          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: EASE }}
            className="flex flex-col items-center justify-center rounded-[28px] border border-white/10 bg-[#0C2419]/80 p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl"
          >
            <div className="relative flex h-[180px] w-[180px] items-center justify-center">
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border border-dashed border-[#E3A82B]/40"
                style={{ animation: "pf-spin 30s linear infinite" }}
              >
                <span className="absolute -top-1.5 left-1/2 -ml-1.5 h-3 w-3 rounded-full bg-[#F2CB6B] shadow-[0_0_18px_#F2CB6B]" />
              </span>
              <span
                aria-hidden
                className="absolute inset-4 rounded-full border border-[#C9DDB0]/30"
                style={{ animation: "pf-spin 20s linear infinite reverse" }}
              >
                <span className="absolute -bottom-1 left-1/2 -ml-1 h-2 w-2 rounded-full bg-[#9DBF7A] shadow-[0_0_14px_#9DBF7A]" />
              </span>
              <span
                aria-hidden
                className="absolute inset-9 rounded-full border border-[#F2CB6B]/40"
                style={{ animation: "pf-pulse 3.6s ease-out infinite" }}
              />

              <AnimatePresence mode="popLayout">
                <motion.div
                  key={avatar ?? "initials"}
                  initial={{ opacity: 0, scale: 0.55, rotate: -24 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.7, rotate: 18 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  className="relative"
                >
                  <ProfileAvatar
                    value={avatar}
                    name={name}
                    className="h-[108px] w-[108px] text-[36px] shadow-[0_18px_50px_rgba(0,0,0,0.5)] ring-4 ring-[#F2CB6B]/70"
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            <p className="mt-2 text-[12px] font-medium text-[#8FA593]">
              {previewLabel}
            </p>

            <h1 className="font-display mt-3 max-w-full truncate text-[28px] font-light leading-tight tracking-[-0.02em]">
              {name}
            </h1>
            {email && (
              <p className="mt-1 max-w-full truncate text-[14px] text-[#93A99A]">
                {email}
              </p>
            )}
            <span className="mt-4 inline-block rounded-full bg-[#E3A82B]/15 px-3.5 py-1.5 text-[12px] font-semibold text-[#F2CB6B]">
              {role}
            </span>

            <div className="my-5 h-px w-full bg-white/10" />

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2.5 rounded-full border border-[#FF9C8F]/30 bg-[#FF9C8F]/[0.07] px-6 py-3.5 text-[14px] font-semibold text-[#FF9C8F] transition hover:-translate-y-0.5 hover:bg-[#FF9C8F]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9C8F]"
            >
              <LogoutIcon className="h-4 w-4" />
              Log out
            </button>
          </motion.aside>

          {/* ------------------------- editor panel ------------------------- */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
            className="flex min-h-0 flex-col rounded-[28px] border border-white/10 bg-[#0C2419]/80 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl"
          >
            <h2 className="font-display text-[26px] font-light tracking-[-0.02em]">
              Choose your avatar
            </h2>
            <p className="mt-1.5 max-w-[520px] text-[14px] leading-6 text-[#A9BCA6]">
              Pick the avatar you like. It shows on your profile button across
              AyurvedAI.
            </p>

            {/* avatar grid (scrolls if there are many) */}
            <div className="pf-scroll -mr-3 mt-4 min-h-0 flex-1 overflow-y-auto pr-3">
              <div className="grid grid-cols-3 gap-3 px-1.5 pb-2 pt-2 sm:grid-cols-4 md:grid-cols-5">
                {AVATARS.map((a, i) => {
                  const selected = avatar === a.id;
                  return (
                    <motion.button
                      key={a.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setAvatar(a.id)}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.03, duration: 0.4, ease: EASE }}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.95 }}
                      className={`relative flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2CB6B] ${
                        selected
                          ? "border-transparent bg-white/[0.06]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25"
                      }`}
                    >
                      {selected && (
                        <motion.span
                          layoutId="avatar-ring"
                          className="absolute inset-0 rounded-2xl border-2 border-[#F2CB6B] shadow-[0_0_30px_rgba(242,203,107,0.25)]"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                      <ProfileAvatar value={a.id} className="h-14 w-14" />
                      <span
                        className={`text-[12px] font-semibold ${
                          selected ? "text-[#F2CB6B]" : "text-[#D5E2CE]"
                        }`}
                      >
                        {a.label}
                      </span>
                      <AnimatePresence>
                        {selected && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22 }}
                            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#F2CB6B] text-[#0C2419]"
                          >
                            <CheckIcon className="h-3 w-3" strokeWidth={3} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* actions */}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <AnimatePresence>
                {savedAt > 0 && (
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-[14px] font-semibold text-[#9DBF7A]"
                  >
                    <CheckIcon className="h-4 w-4" strokeWidth={2.6} />
                    Profile saved
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                type="button"
                disabled={!dirty}
                onClick={handleSave}
                className="ml-auto flex h-12 items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#F2CB6B] to-[#E3A82B] px-9 text-[15px] font-bold text-[#0C2419] shadow-[0_14px_44px_rgba(227,168,43,0.28)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_54px_rgba(227,168,43,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                Save changes
              </button>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
