import React, { useMemo, useState } from "react";
import logo from "./assets/ayurvedAI_logo.png";
import { useNavigate } from "react-router-dom";

const LEAF_COLORS = [
  "#4F7942",
  "#6B8E4E",
  "#8FAF5A",
  "#3E6B35",
  "#5C8A3C",
  "#7CA653",
];

function useLeaves(count: number) {
  return useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const left = Math.random() * 100;
      const size = 10 + Math.random() * 14;
      const duration = 9 + Math.random() * 8;
      const delay = -(Math.random() * 16);
      const sway = 60 + Math.random() * 120;
      const depth = 40 + Math.random() * 140;
      const color = LEAF_COLORS[i % LEAF_COLORS.length];
      const spin = 720 + Math.random() * 720;

      return {
        id: i,
        left,
        size,
        duration,
        delay,
        sway,
        depth,
        color,
        spin,
      };
    });
  }, [count]);
}

function Leaf({ leaf }: { leaf: ReturnType<typeof useLeaves>[number] }) {
  const style = {
    left: `${leaf.left}%`,
    "--sway": `${leaf.sway}px`,
    "--depth": `${leaf.depth}px`,
    "--spin": `${leaf.spin}deg`,
    width: leaf.size,
    height: leaf.size,
    animationDuration: `${leaf.duration}s`,
    animationDelay: `${leaf.delay}s`,
  } as React.CSSProperties;

  return (
    <div className="leaf" style={style}>
      <svg viewBox="0 0 32 32" width="100%" height="100%">
        <path
          d="M16 2C22 6 28 12 28 19C28 26 22 30 16 30C10 30 4 26 4 19C4 12 10 6 16 2Z"
          fill={leaf.color}
        />
        <path
          d="M16 4 L16 28"
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={1}
          fill="none"
        />
      </svg>
    </div>
  );
}

const initialForm = {
  name: "",
  email: "",
  password: "",
  confirm: "",
  agree: false,
};

export default function RegistrationPage() {

  const navigate = useNavigate();
  const leaves = useLeaves(26);
  const [form, setForm] = useState(initialForm);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const update = (key: keyof typeof initialForm) => (e: any) => {
    const value =
      key === "agree" ? e.target.checked : e.target.value;

    setForm((f) => ({
      ...f,
      [key]: value,
    }));
  };

  const validate = () => {
    const next: Record<string, string> = {};

    if (!form.name.trim()) {
      next.name = "Enter your name.";
    }

    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      next.email = "Enter a valid email.";
    }

    if (form.password.length < 8) {
      next.password = "At least 8 characters.";
    }

    if (form.confirm !== form.password) {
      next.confirm = "Passwords don't match.";
    }

    if (!form.agree) {
      next.agree = "Required to continue.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!validate()) {
    return;
  }

  try {
    const response = await fetch("http://127.0.0.1:8000/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        confirm_password: form.confirm,
        terms_accepted: form.agree,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setErrors({
        email: data.detail || "Registration failed.",
      });
      return;
    }

    setSubmitted(true);
  } catch (error) {
    setErrors({
      email: "Unable to connect to the server.",
    });
  }
};

  return (
    <div
      className="relative h-screen w-full overflow-hidden flex items-center justify-center px-4 py-10"
      style={{
        background:
          "radial-gradient(70% 55% at 50% 8%, rgba(200,231,180,0.14) 0%, rgba(200,231,180,0) 60%), linear-gradient(180deg, #0A1710 0%, #12251A 40%, #16301F 72%, #0D1F14 100%)",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');

        @keyframes leafFall {
          0% {
            transform:
              translate3d(0, -12vh, 0)
              rotateX(0deg)
              rotateY(0deg)
              rotateZ(0deg);
            opacity: 0;
          }

          8% {
            opacity: 1;
          }

          50% {
            transform:
              translate3d(var(--sway), 52vh, var(--depth))
              rotateX(180deg)
              rotateY(160deg)
              rotateZ(calc(var(--spin) * 0.5));
          }

          92% {
            opacity: 0.9;
          }

          100% {
            transform:
              translate3d(calc(var(--sway) * -0.6), 112vh, 0px)
              rotateX(360deg)
              rotateY(320deg)
              rotateZ(var(--spin));
            opacity: 0;
          }
        }

        .leaf {
          position: absolute;
          top: 0;
          animation-name: leafFall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          transform-style: preserve-3d;
          will-change: transform;
        }

        .leaf-field {
          perspective: 900px;
          transform-style: preserve-3d;
        }

        @media (prefers-reduced-motion: reduce) {
          .leaf {
            animation: none;
            opacity: 0.5;
          }
        }
      `}</style>

      <div className="leaf-field absolute inset-0 pointer-events-none">
        {leaves.map((leaf) => (
          <Leaf key={leaf.id} leaf={leaf} />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-6xl grid lg:grid-cols-[1fr_420px] gap-10 lg:gap-16 items-center">

        {/* AyurvedAI Information */}
        <div className="hidden lg:block px-6 lg:px-10">
          <div className="max-w-lg">

            {/* Logo */}
            <div className="mb-7">
              <img
                src={logo}
                alt="AyurvedAI"
                className="w-[180px] h-auto object-contain"
              />
            </div>

            <h2
              className="text-4xl xl:text-5xl leading-[1.08] text-[#EAF2DD] mb-5"
              style={{
                fontFamily: "Fraunces, serif",
                fontWeight: 600,
              }}
            >
              Ayurveda,
              <br />
              <span className="text-[#A9C97C]">
                powered by AI.
              </span>
            </h2>

            <p
              className="text-[#B7C4A9] text-sm leading-6 max-w-md mb-7"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Explore Ayurvedic knowledge, herbs, medicines,
              and healthy living with intelligent AI guidance.
            </p>

            <div className="space-y-4 max-w-md">

              <div className="flex items-center gap-4">
                <div
                  className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border border-[#8FAF5A]/20"
                  style={{
                    background: "rgba(143,175,90,0.08)",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#A9C97C"
                    strokeWidth="1.7"
                  >
                    <path d="M12 3C7 3 4 6 4 10C4 14 7 16 12 16C17 16 20 14 20 10C20 6 17 3 12 3Z" />
                    <path d="M8 21L12 16L16 21" />
                    <path d="M8 10H16" />
                  </svg>
                </div>

                <div>
                  <h3
                    className="text-sm text-[#EAF2DD] font-medium"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    AI Conversations
                  </h3>

                  <p
                    className="text-xs text-[#8FA080] leading-5"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    Ask questions and get simple Ayurvedic answers.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div
                  className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border border-[#8FAF5A]/20"
                  style={{
                    background: "rgba(143,175,90,0.08)",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#A9C97C"
                    strokeWidth="1.7"
                  >
                    <rect x="3" y="4" width="18" height="16" rx="3" />
                    <circle cx="8" cy="9" r="1.5" />
                    <path d="M21 16L16 11L7 20" />
                  </svg>
                </div>

                <div>
                  <h3
                    className="text-sm text-[#EAF2DD] font-medium"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    Identify Herbs
                  </h3>

                  <p
                    className="text-xs text-[#8FA080] leading-5"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    Upload a herb photo and learn about it.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div
                  className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border border-[#8FAF5A]/20"
                  style={{
                    background: "rgba(143,175,90,0.08)",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#A9C97C"
                    strokeWidth="1.7"
                  >
                    <path d="M8 6H4V20H18V16" />
                    <path d="M8 4H20V16H8V4Z" />
                    <path d="M11 8H17" />
                    <path d="M11 11H17" />
                  </svg>
                </div>

                <div>
                  <h3
                    className="text-sm text-[#EAF2DD] font-medium"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    Trusted Knowledge
                  </h3>

                  <p
                    className="text-xs text-[#8FA080] leading-5"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    Information from a curated Ayurvedic knowledge base.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Registration Card */}
        <div
          className="relative w-full max-w-md mx-auto rounded-[28px] p-8 sm:p-10 border border-white/15"
          style={{
            background: "rgba(150,190,120,0.08)",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
            boxShadow:
              "0 25px 70px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14)",
          }}
        >

          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <img
              src={logo}
              alt="AyurvedAI"
              className="w-[130px] h-auto object-contain"
            />
          </div>

          {submitted ? (
            <div className="text-center py-6">
              <h2
                className="text-2xl text-[#EAF2DD] mb-2"
                style={{
                  fontFamily: "Fraunces, serif",
                }}
              >
                You're in, {form.name.split(" ")[0]}
              </h2>

              <p
                className="text-[#C4CFB8] text-sm"
                style={{
                  fontFamily: "Inter, sans-serif",
                }}
              >
                We've planted your account. Check {form.email} to
                confirm it.
              </p>
              
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="mt-6 text-sm text-[#8FAF5A] hover:text-[#a9c97c]"
                style={{
                  fontFamily: "Inter, sans-serif",
                }}
              >
                Back to Sign in
              </button>
            </div>
          ) : (
            <>
              <h1
                className="text-3xl sm:text-[34px] leading-tight text-[#EAF2DD] mb-1"
                style={{
                  fontFamily: "Fraunces, serif",
                  fontWeight: 600,
                }}
              >
                Create AyurvedAI account
              </h1>

              <p
                className="text-[#B7C4A9] text-sm mb-7"
                style={{
                  fontFamily: "Inter, sans-serif",
                }}
              >
                Discover Ayurveda, powered by intelligent AI.
              </p>

              <form
                onSubmit={onSubmit}
                noValidate
                className="space-y-4"
              >
                <Field label="Full name" error={errors.name}>
                  <input
                    type="text"
                    value={form.name}
                    onChange={update("name")}
                    placeholder="Avinash Tarbundiya"
                    className={inputClass(errors.name)}
                  />
                </Field>

                <Field label="Email" error={errors.email}>
                  <input
                    type="email"
                    value={form.email}
                    onChange={update("email")}
                    placeholder="example@gmail.com"
                    className={inputClass(errors.email)}
                  />
                </Field>

                <Field label="Password" error={errors.password}>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={form.password}
                      onChange={update("password")}
                      placeholder="At least 8 characters"
                      className={
                        inputClass(errors.password) + " pr-11"
                      }
                    />

                    <EyeToggle
                      shown={showPw}
                      onClick={() => setShowPw((s) => !s)}
                    />
                  </div>
                </Field>

                <Field
                  label="Confirm password"
                  error={errors.confirm}
                >
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={form.confirm}
                      onChange={update("confirm")}
                      placeholder="Type it again"
                      className={
                        inputClass(errors.confirm) + " pr-11"
                      }
                    />

                    <EyeToggle
                      shown={showConfirm}
                      onClick={() =>
                        setShowConfirm((s) => !s)
                      }
                    />
                  </div>
                </Field>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.agree}
                    onChange={update("agree")}
                    className="mt-0.5 h-4 w-4 rounded border-white/30 bg-white/10 accent-[#6B8E4E]"
                  />

                  <span
                    className="text-sm text-[#B7C4A9]"
                    style={{
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    I agree to the Terms and Privacy Policy.
                  </span>
                </label>

                {errors.agree && (
                  <p className="text-xs text-[#E8967A] -mt-2">
                    {errors.agree}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full mt-2 rounded-xl py-3 text-[#12200F] font-medium transition-transform active:scale-[0.99]"
                  style={{
                    fontFamily: "Inter, sans-serif",
                    background:
                      "linear-gradient(135deg, #A9C97C 0%, #7CA653 55%, #3F6B3F 100%)",
                    boxShadow:
                      "0 10px 24px -8px rgba(124,166,83,0.55)",
                  }}
                >
                  Create account
                </button>
              </form>

              <p
                className="text-center text-sm text-[#8FA080] mt-6"
                style={{
                  fontFamily: "Inter, sans-serif",
                }}
              >
                Already have an account?{" "}
                <a
                  href="/login"
                  className="text-[#8FAF5A] hover:text-[#a9c97c]"
                >
                  Sign in
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs mb-1.5 text-[#A6B399]"
        style={{
          fontFamily: "Inter, sans-serif",
        }}
      >
        {label}
      </label>

      {children}

      {error && (
        <p className="text-xs text-[#E8967A] mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClass(error?: string) {
  return (
    "w-full rounded-xl bg-white/8 border px-4 py-2.5 text-[#EAF2DD] placeholder-[#7E9077] outline-none transition-colors " +
    "focus:border-[#8FAF5A]/70 focus:bg-white/10 " +
    (error
      ? "border-[#E8967A]/60"
      : "border-white/15")
  );
}

function EyeToggle({
  shown,
  onClick,
}: {
  shown: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A6B399] hover:text-[#EAF2DD]"
      tabIndex={-1}
    >
      {shown ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path d="M3 3l18 18" />
          <path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c5.5 0 9 7 9 7a13.6 13.6 0 0 1-3.1 3.9M6.5 6.6C4 8.3 3 12 3 12s3.5 7 9 7a8.9 8.9 0 0 0 3.4-.7" />
          <path d="M9.5 9.6a3 3 0 0 0 4.2 4.2" />
        </svg>
      )}
    </button>
  );
}
