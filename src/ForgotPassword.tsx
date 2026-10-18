import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "./assets/ayurvedAI_logo.png";

const API_BASE = "http://127.0.0.1:8000";

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

      return { id: i, left, size, duration, delay, sway, depth, color, spin };
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
        <path d="M16 4 L16 28" stroke="rgba(0,0,0,0.25)" strokeWidth={1} fill="none" />
      </svg>
    </div>
  );
}

type Step = "email" | "otp" | "reset" | "done";

const OTP_SECONDS = 120;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const leaves = useLeaves(26);

  const [step, setStep] = useState<Step>("email");

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);

  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [otpError, setOtpError] = useState("");
  const [loadingOtp, setLoadingOtp] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(OTP_SECONDS);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetErrors, setResetErrors] = useState<{ password?: string; confirm?: string }>({});
  const [loadingReset, setLoadingReset] = useState(false);

  useEffect(() => {
    if (step !== "otp") return;

    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setEmailError("Enter your email.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEmailError("Enter a valid email.");
      return;
    }

    setEmailError("");
    setLoadingEmail(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setEmailError(data.detail || "Something went wrong.");
        return;
      }

      setOtp(Array(6).fill(""));
      setOtpError("");
      setSecondsLeft(OTP_SECONDS);
      setStep("otp");
    } catch (err) {
      setEmailError("Unable to connect to the server.");
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpError("");
    setLoadingOtp(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOtpError(data.detail || "Unable to resend OTP.");
        return;
      }

      setOtp(Array(6).fill(""));
      setSecondsLeft(OTP_SECONDS);
      otpRefs.current[0]?.focus();
    } catch (err) {
      setOtpError("Unable to connect to the server.");
    } finally {
      setLoadingOtp(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const next = [...otp];
    next[index] = value;
    setOtp(next);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = otp.join("");

    if (code.length !== 6) {
      setOtpError("Enter the 6 digit code.");
      return;
    }

    if (secondsLeft <= 0) {
      setOtpError("OTP expired. Please resend.");
      return;
    }

    setOtpError("");
    setLoadingOtp(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOtpError(data.detail || "Invalid OTP.");
        return;
      }

      setStep("reset");
    } catch (err) {
      setOtpError("Unable to connect to the server.");
    } finally {
      setLoadingOtp(false);
    }
  };

  const validateReset = () => {
    const next: { password?: string; confirm?: string } = {};

    if (newPassword.length < 8) {
      next.password = "At least 8 characters.";
    }

    if (confirmPassword !== newPassword) {
      next.confirm = "Passwords don't match.";
    }

    setResetErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateReset()) return;

    setLoadingReset(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResetErrors({ password: data.detail || "Unable to reset password." });
        return;
      }

      setStep("done");
    } catch (err) {
      setResetErrors({ password: "Unable to connect to the server." });
    } finally {
      setLoadingReset(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden flex items-center justify-center px-4 py-10"
      style={{
        background:
          "radial-gradient(70% 55% at 50% 8%, rgba(200,231,180,0.14) 0%, rgba(200,231,180,0) 60%), linear-gradient(180deg, #0A1710 0%, #12251A 40%, #16301F 72%, #0D1F14 100%)",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');

        @keyframes leafFall {
          0% { transform: translate3d(0, -12vh, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg); opacity: 0; }
          8% { opacity: 1; }
          50% { transform: translate3d(var(--sway), 52vh, var(--depth)) rotateX(180deg) rotateY(160deg) rotateZ(calc(var(--spin) * 0.5)); }
          92% { opacity: 0.9; }
          100% { transform: translate3d(calc(var(--sway) * -0.6), 112vh, 0px) rotateX(360deg) rotateY(320deg) rotateZ(var(--spin)); opacity: 0; }
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

        @keyframes stepIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .step-enter {
          animation: stepIn 0.35s ease-out;
        }

        @keyframes otpPop {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }

        .otp-box {
          animation: otpPop 0.3s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .leaf { animation: none; opacity: 0.5; }
          .step-enter, .otp-box { animation: none; }
        }
      `}</style>

      <div className="leaf-field absolute inset-0 pointer-events-none">
        {leaves.map((leaf) => (
          <Leaf key={leaf.id} leaf={leaf} />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-6xl grid lg:grid-cols-[1fr_420px] gap-10 lg:gap-16 items-center">
        <div className="hidden lg:block px-6 lg:px-10">
          <div className="max-w-lg">
            <div className="mb-7">
              <img src={logo} alt="AyurvedAI" className="w-[180px] h-auto object-contain" />
            </div>

            <h2
              className="text-4xl xl:text-5xl leading-[1.08] text-[#EAF2DD] mb-5"
              style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}
            >
              Ayurveda,
              <br />
              <span className="text-[#A9C97C]">powered by AI.</span>
            </h2>

            <p className="text-[#B7C4A9] text-sm leading-6 max-w-md mb-7" style={{ fontFamily: "Inter, sans-serif" }}>
              Explore Ayurvedic knowledge, herbs, medicines, and healthy living with intelligent AI guidance.
            </p>

            <div className="space-y-4 max-w-md">
              <Feature title="AI Conversations" description="Ask questions and get simple Ayurvedic answers.">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A9C97C" strokeWidth="1.7">
                  <path d="M12 3C7 3 4 6 4 10C4 14 7 16 12 16C17 16 20 14 20 10C20 6 17 3 12 3Z" />
                  <path d="M8 21L12 16L16 21" />
                  <path d="M8 10H16" />
                </svg>
              </Feature>

              <Feature title="Identify Herbs" description="Upload a herb photo and learn about it.">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A9C97C" strokeWidth="1.7">
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <circle cx="8" cy="9" r="1.5" />
                  <path d="M21 16L16 11L7 20" />
                </svg>
              </Feature>

              <Feature title="Trusted Knowledge" description="Information from a curated Ayurvedic knowledge base.">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A9C97C" strokeWidth="1.7">
                  <path d="M8 6H4V20H18V16" />
                  <path d="M8 4H20V16H8V4Z" />
                  <path d="M11 8H17" />
                  <path d="M11 11H17" />
                </svg>
              </Feature>
            </div>
          </div>
        </div>

        <div
          className="relative w-full max-w-md mx-auto rounded-[28px] p-8 sm:p-10 border border-white/15"
          style={{
            background: "rgba(150,190,120,0.08)",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
            boxShadow: "0 25px 70px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14)",
          }}
        >
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <img src={logo} alt="AyurvedAI" className="w-[130px] h-auto object-contain" />
          </div>

          {step === "email" && (
            <div key="email" className="step-enter">
              <h1
                className="text-3xl sm:text-[34px] leading-tight text-[#EAF2DD] mb-1"
                style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}
              >
                Forgot password?
              </h1>

              <p className="text-[#B7C4A9] text-sm leading-6 mb-7" style={{ fontFamily: "Inter, sans-serif" }}>
                Enter your email and we'll send you a 6 digit code to reset your password.
              </p>

              <form onSubmit={handleSendOtp} noValidate className="space-y-4">
                <Field label="Email" error={emailError}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError("");
                    }}
                    placeholder="example@gmail.com"
                    className={inputClass(emailError)}
                  />
                </Field>

                <button
                  type="submit"
                  disabled={loadingEmail}
                  className={primaryButtonClass()}
                  style={primaryButtonStyle()}
                >
                  {loadingEmail ? "Sending..." : "Send OTP"}
                </button>
              </form>

              <p className="text-center text-sm text-[#8FA080] mt-6" style={{ fontFamily: "Inter, sans-serif" }}>
                Remember your password?{" "}
                <a href="/login" className="text-[#8FAF5A] hover:text-[#a9c97c]">
                  Back to login
                </a>
              </p>
            </div>
          )}

          {step === "otp" && (
            <div key="otp" className="step-enter">
              <h1
                className="text-3xl sm:text-[34px] leading-tight text-[#EAF2DD] mb-1"
                style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}
              >
                Enter the code
              </h1>

              <p className="text-[#B7C4A9] text-sm leading-6 mb-7" style={{ fontFamily: "Inter, sans-serif" }}>
                We've sent a 6 digit code to{" "}
                <span className="text-[#A9C97C]">{email}</span>.
              </p>

              <form onSubmit={handleVerifyOtp} noValidate className="space-y-4">
                <div className="flex justify-between gap-2">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el }}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      inputMode="numeric"
                      maxLength={1}
                      style={{ animationDelay: `${i * 0.05}s` }}
                      className={
                        "otp-box w-11 h-12 text-center text-lg rounded-xl bg-white/8 border text-[#EAF2DD] outline-none transition-colors focus:border-[#8FAF5A]/70 focus:bg-white/10 " +
                        (otpError ? "border-[#E8967A]/60" : "border-white/15")
                      }
                    />
                  ))}
                </div>

                {otpError && <p className="text-xs text-[#E8967A]">{otpError}</p>}

                <div className="flex items-center justify-between text-sm" style={{ fontFamily: "Inter, sans-serif" }}>
                  <span className="text-[#8FA080]">
                    {secondsLeft > 0 ? `Code expires in ${formatTime(secondsLeft)}` : "Code expired"}
                  </span>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={secondsLeft > 0 || loadingOtp}
                    className="text-[#8FAF5A] hover:text-[#a9c97c] disabled:text-[#5A6650] disabled:cursor-not-allowed"
                  >
                    Resend OTP
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loadingOtp}
                  className={primaryButtonClass()}
                  style={primaryButtonStyle()}
                >
                  {loadingOtp ? "Verifying..." : "Verify OTP"}
                </button>
              </form>

              <p className="text-center text-sm text-[#8FA080] mt-6" style={{ fontFamily: "Inter, sans-serif" }}>
                Wrong email?{" "}
                <button
                  type="button"
                  onClick={() => setStep("email")}
                  className="text-[#8FAF5A] hover:text-[#a9c97c]"
                >
                  Change it
                </button>
              </p>
            </div>
          )}

          {step === "reset" && (
            <div key="reset" className="step-enter">
              <h1
                className="text-3xl sm:text-[34px] leading-tight text-[#EAF2DD] mb-1"
                style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}
              >
                Set a new password
              </h1>

              <p className="text-[#B7C4A9] text-sm leading-6 mb-7" style={{ fontFamily: "Inter, sans-serif" }}>
                Choose a strong new password for your account.
              </p>

              <form onSubmit={handleResetPassword} noValidate className="space-y-4">
                <Field label="New password" error={resetErrors.password}>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className={inputClass(resetErrors.password) + " pr-11"}
                    />
                    <EyeToggle shown={showPw} onClick={() => setShowPw((s) => !s)} />
                  </div>
                </Field>

                <Field label="Confirm password" error={resetErrors.confirm}>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Type it again"
                      className={inputClass(resetErrors.confirm) + " pr-11"}
                    />
                    <EyeToggle shown={showConfirm} onClick={() => setShowConfirm((s) => !s)} />
                  </div>
                </Field>

                <button
                  type="submit"
                  disabled={loadingReset}
                  className={primaryButtonClass()}
                  style={primaryButtonStyle()}
                >
                  {loadingReset ? "Updating..." : "Change password"}
                </button>
              </form>
            </div>
          )}

          {step === "done" && (
            <div key="done" className="step-enter text-center py-6">
              <div className="flex justify-center mb-5">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center border border-[#A9C97C]/30"
                  style={{ background: "rgba(169,201,124,0.10)" }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A9C97C" strokeWidth="1.8">
                    <path d="M5 12.5L9.5 17L19 7" />
                  </svg>
                </div>
              </div>

              <h2 className="text-2xl text-[#EAF2DD] mb-2" style={{ fontFamily: "Fraunces, serif" }}>
                Password changed
              </h2>

              <p className="text-[#C4CFB8] text-sm leading-6" style={{ fontFamily: "Inter, sans-serif" }}>
                Your password has been updated. You can now sign in with your new password.
              </p>

              <button
                onClick={() => navigate("/login")}
                className="mt-6 text-sm text-[#8FAF5A] hover:text-[#a9c97c]"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Back to login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Feature({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div
        className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border border-[#8FAF5A]/20"
        style={{ background: "rgba(143,175,90,0.08)" }}
      >
        {children}
      </div>

      <div>
        <h3 className="text-sm text-[#EAF2DD] font-medium" style={{ fontFamily: "Inter, sans-serif" }}>
          {title}
        </h3>
        <p className="text-xs text-[#8FA080] leading-5" style={{ fontFamily: "Inter, sans-serif" }}>
          {description}
        </p>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs mb-1.5 text-[#A6B399]" style={{ fontFamily: "Inter, sans-serif" }}>
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-[#E8967A] mt-1">{error}</p>}
    </div>
  );
}

function EyeToggle({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A6B399] hover:text-[#EAF2DD]"
      tabIndex={-1}
    >
      {shown ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c5.5 0 9 7 9 7a13.6 13.6 0 0 1-3.1 3.9M6.5 6.6C4 8.3 3 12 3 12s3.5 7 9 7a8.9 8.9 0 0 0 3.4-.7" />
          <path d="M9.5 9.6a3 3 0 0 0 4.2 4.2" />
        </svg>
      )}
    </button>
  );
}

function inputClass(error?: string) {
  return (
    "w-full rounded-xl bg-white/8 border px-4 py-2.5 text-[#EAF2DD] placeholder-[#7E9077] outline-none transition-colors " +
    "focus:border-[#8FAF5A]/70 focus:bg-white/10 " +
    (error ? "border-[#E8967A]/60" : "border-white/15")
  );
}

function primaryButtonClass() {
  return "w-full mt-2 rounded-xl py-3 text-[#12200F] font-medium transition-transform active:scale-[0.99] disabled:opacity-60";
}

function primaryButtonStyle(): React.CSSProperties {
  return {
    fontFamily: "Inter, sans-serif",
    background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 55%, #3F6B3F 100%)",
    boxShadow: "0 10px 24px -8px rgba(124,166,83,0.55)",
  };
}