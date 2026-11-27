import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "./assets/ayurvedAI_logo.png";
import ClinicsView from "./components/admin/ClinicsView";
import DashboardView from "./components/admin/DashboardView";
import HerbCatalogView from "./components/admin/HerbCatalogView";
import KnowledgeBaseView from "./components/admin/KnowledgeBaseView";
import LifestyleView from "./components/admin/LifestyleView";
import LoginActivityView from "./components/admin/LoginActivityView";
import MedicineCatalogView from "./components/admin/MedicineCatalogView";
import ReportDocument from "./components/admin/ReportDocument";
import { REPORT_SECTIONS, type LoginRange, type ReportSection } from "./components/admin/reportConfig";
import ReportsView from "./components/admin/ReportsView";
import SafetyView from "./components/admin/SafetyView";
import SystemHealthView from "./components/admin/SystemHealthView";
import UsersView from "./components/admin/UsersView";
import type { AdminView, LoggedInAdmin } from "./components/admin/types";
import { NotifyProvider } from "./components/admin/ui";
import { Icons } from "./components/admin/icons";

const LEAF_COLORS = ["#4F7942", "#6B8E4E", "#8FAF5A", "#3E6B35", "#5C8A3C", "#7CA653"];

type NavItem = { view: AdminView; label: string; icon: (props: { size?: number }) => React.ReactElement; title: string; subtitle: string };

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [
      { view: "dashboard", label: "Dashboard", icon: Icons.Dashboard, title: "Dashboard", subtitle: "Platform overview and key figures." },
      { view: "reports", label: "Reports", icon: Icons.Report, title: "Reports", subtitle: "Generate a printable administration report." },
    ],
  },
  {
    heading: "Users & Access",
    items: [
      { view: "users", label: "User Management", icon: Icons.Users, title: "User Management", subtitle: "Manage registered accounts and access." },
      { view: "logins", label: "Login Activity", icon: Icons.History, title: "Login Activity", subtitle: "Monitor sign-in attempts and authentication failures." },
    ],
  },
  {
    heading: "Content Management",
    items: [
      { view: "knowledge", label: "Knowledge Base", icon: Icons.Documents, title: "Knowledge Base", subtitle: "Documents the AI assistant uses to answer questions." },
      { view: "herbs", label: "Herb Catalog", icon: Icons.Leaf, title: "Herb Catalog", subtitle: "Review and maintain herb information." },
      { view: "medicines", label: "Medicine Catalog", icon: Icons.Medicine, title: "Medicine Catalog", subtitle: "Review and maintain classical formulations." },
      { view: "lifestyle", label: "Lifestyle Guidelines", icon: Icons.Sun, title: "Lifestyle Guidelines", subtitle: "Diet rules, daily routine and saved plans." },
      { view: "clinics", label: "Verified Clinics", icon: Icons.MapPin, title: "Verified Clinics", subtitle: "Trusted places shown first in the Healthcare Locator." },
    ],
  },
  {
    heading: "Monitoring",
    items: [
      { view: "safety", label: "Safety Monitoring", icon: Icons.Shield, title: "Safety Monitoring", subtitle: "Safety alerts raised by the AI safety filter." },
      { view: "health", label: "System Health", icon: Icons.Pulse, title: "System Health", subtitle: "Live status of backend services and integrations." },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

type LeafSpec = { id: number; left: number; size: number; duration: number; delay: number; sway: number; depth: number; color: string; spin: number };

function makeLeaves(count: number): LeafSpec[] {
  return Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 10 + Math.random() * 14,
        duration: 9 + Math.random() * 8,
        delay: -(Math.random() * 16),
        sway: 60 + Math.random() * 120,
        depth: 40 + Math.random() * 140,
        color: LEAF_COLORS[i % LEAF_COLORS.length],
    spin: 720 + Math.random() * 720,
  }));
}

const Leaf = React.memo(function Leaf({ leaf }: { leaf: LeafSpec }) {
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
        <path d="M16 2C22 6 28 12 28 19C28 26 22 30 16 30C10 30 4 26 4 19C4 12 10 6 16 2Z" fill={leaf.color} />
        <path d="M16 4 L16 28" stroke="rgba(0,0,0,0.25)" strokeWidth={1} fill="none" />
      </svg>
    </div>
  );
});

function readAdmin(): LoggedInAdmin | null {
  try {
    const stored = localStorage.getItem("ayurvedai_user");
    return stored ? (JSON.parse(stored) as LoggedInAdmin) : null;
  } catch {
    return null;
  }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [leaves] = useState(() => makeLeaves(22));
  const [admin] = useState<LoggedInAdmin | null>(readAdmin);
  const [activeView, setActiveView] = useState<AdminView>("dashboard");
  const [report, setReport] = useState<{ sections: ReportSection[]; loginRange: LoginRange } | null>(null);

  const current = ALL_ITEMS.find((item) => item.view === activeView) ?? ALL_ITEMS[0];
  const subtitle = activeView === "dashboard" && admin?.name ? `Welcome back, ${admin.name}. Here is how AyurvedAI is doing.` : current.subtitle;

  const handleLogout = useCallback(() => {
    localStorage.removeItem("ayurvedai_user");
    navigate("/login");
  }, [navigate]);

  const goTo = useCallback((view: AdminView) => {
    setActiveView(view);
    window.scrollTo({ top: 0 });
  }, []);

  const openFullReport = () => setReport({ sections: REPORT_SECTIONS.map((item) => item.key), loginRange: "all" });
  const closeReport = useCallback(() => setReport(null), []);

  return (
    <NotifyProvider>
      <div
        className="relative min-h-screen w-full overflow-x-hidden"
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
          @keyframes adminIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }

          .admin-root { font-family: Inter, sans-serif; }
          .font-admin-display { font-family: Fraunces, serif; font-weight: 600; }
          .leaf { position: absolute; top: 0; animation-name: leafFall; animation-timing-function: linear; animation-iteration-count: infinite; transform-style: preserve-3d; will-change: transform; }
          .leaf-field { perspective: 900px; transform-style: preserve-3d; }
          .admin-modal, .admin-toast { animation: adminIn 0.2s ease-out; }
          .admin-view { animation: adminIn 0.25s ease-out; }
          .admin-select option { background: #12251A; color: #EAF2DD; }
          .admin-nav::-webkit-scrollbar { width: 6px; }
          .admin-nav::-webkit-scrollbar-thumb { background: rgba(143,175,90,0.25); border-radius: 3px; }

          @media (prefers-reduced-motion: reduce) {
            .leaf { animation: none; opacity: 0.5; }
            .admin-modal, .admin-toast, .admin-view { animation: none; }
          }
        `}</style>

        <div className="leaf-field pointer-events-none fixed inset-0">
          {leaves.map((leaf) => (
            <Leaf key={leaf.id} leaf={leaf} />
          ))}
        </div>

        <div className="admin-root relative z-10 flex min-h-screen">
          {/* ---------------- Sidebar (desktop) ---------------- */}
          <aside
            className="admin-nav fixed inset-y-0 left-0 z-20 hidden w-[262px] flex-col overflow-y-auto border-r border-white/10 px-5 py-5 lg:flex"
            style={{ background: "rgba(10,23,16,0.7)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
          >
            <div className="mb-5 flex items-center gap-3">
              <img src={logo} alt="AyurvedAI" className="h-12 w-12 shrink-0 object-contain" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#7E9077]">Administration</p>
                <h2 className="font-admin-display text-lg leading-tight text-[#EAF2DD]">Admin Panel</h2>
              </div>
            </div>
            <div className="mb-5">
              {admin?.name && (
                <div className="rounded-xl border border-[#8FAF5A]/15 px-3 py-2.5" style={{ background: "rgba(143,175,90,0.06)" }}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#71806C]">Signed in as</p>
                  <p className="truncate text-xs font-medium text-[#A9C97C]">{admin.name}</p>
                  {admin.email && <p className="truncate text-[11px] text-[#71806C]">{admin.email}</p>}
                </div>
              )}
            </div>

            <nav className="flex-1 space-y-4" aria-label="Admin sections">
              {NAV_GROUPS.map((group) => (
                <div key={group.heading}>
                  <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[#5F6E59]">{group.heading}</p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = activeView === item.view;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.view}
                          type="button"
                          onClick={() => goTo(item.view)}
                          aria-current={active ? "page" : undefined}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${active ? "font-medium" : "hover:bg-white/5 hover:text-[#D5DFC9]"}`}
                          style={active ? { background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)", color: "#12200F" } : { color: "#A6B399" }}
                        >
                          <Icon size={17} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <button type="button" onClick={handleLogout} className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#E8967A] transition hover:bg-[#E8967A]/10">
              <Icons.Logout size={17} />
              Logout
            </button>
          </aside>

          {/* ---------------- Main content ---------------- */}
          <main className="min-w-0 flex-1 px-4 py-5 sm:px-8 sm:py-8 lg:ml-[262px] lg:px-10">
            {/* mobile navigation */}
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <img src={logo} alt="AyurvedAI" className="h-10 w-10 object-contain" />
              <label htmlFor="admin-mobile-nav" className="sr-only">Admin section</label>
              <select
                id="admin-mobile-nav"
                value={activeView}
                onChange={(event) => goTo(event.target.value as AdminView)}
                className="admin-select min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-[#EAF2DD] outline-none"
              >
                {NAV_GROUPS.map((group) => (
                  <optgroup key={group.heading} label={group.heading}>
                    {group.items.map((item) => (
                      <option key={item.view} value={item.view}>{item.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button type="button" onClick={handleLogout} aria-label="Logout" className="rounded-xl border border-[#E8967A]/25 p-2.5 text-[#E8967A]">
                <Icons.Logout size={17} />
              </button>
            </div>

            <div className="mx-auto max-w-7xl">
              <div className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                  <p className="mb-1 text-sm text-[#8FAF5A]">AyurvedAI Administration</p>
                  <h1 className="font-admin-display text-3xl text-[#EAF2DD] sm:text-4xl">{current.title}</h1>
                  <p className="mt-2 text-sm text-[#8FA080]">{subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => navigate("/home")} className="inline-flex items-center gap-2 rounded-xl border border-[#8FAF5A]/20 px-4 py-2.5 text-sm text-[#A9C97C] transition hover:bg-[#8FAF5A]/10">
                    <Icons.Globe /> View Website
                  </button>
                  <button
                    type="button"
                    onClick={openFullReport}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-[#12200F] transition hover:brightness-110"
                    style={{ background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)" }}
                    title="Generate a full printable report of all admin data"
                  >
                    <Icons.Printer /> Generate Report
                  </button>
                </div>
              </div>

              <div key={activeView} className="admin-view">
                {activeView === "dashboard" && <DashboardView onNavigate={goTo} />}
                {activeView === "reports" && <ReportsView onGenerate={(sections, loginRange) => setReport({ sections, loginRange })} />}
                {activeView === "users" && <UsersView />}
                {activeView === "logins" && <LoginActivityView />}
                {activeView === "knowledge" && <KnowledgeBaseView />}
                {activeView === "herbs" && <HerbCatalogView />}
                {activeView === "medicines" && <MedicineCatalogView />}
                {activeView === "lifestyle" && <LifestyleView />}
                {activeView === "clinics" && <ClinicsView />}
                {activeView === "safety" && <SafetyView />}
                {activeView === "health" && <SystemHealthView />}
              </div>
            </div>
          </main>
        </div>

        {report && <ReportDocument sections={report.sections} loginRange={report.loginRange} admin={admin} onClose={closeReport} />}
      </div>
    </NotifyProvider>
  );
}
