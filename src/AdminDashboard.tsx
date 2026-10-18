import React, { useCallback, useEffect, useMemo, useState } from "react";
import logo from "./assets/ayurvedAI_logo.png";
import { useNavigate } from "react-router-dom";

type User = {
  id: number;
  name: string;
  email: string;
  status: "active" | "inactive";
  created_at: string;
};

type LoginRecord = {
  id: number;
  user_id: number | null;
  email: string;
  login_at: string;
  ip_address: string | null;
  user_agent: string | null;
  status: "success" | "failed";
  failure_reason: string | null;
};

type LoggedInAdmin = {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
};

type AdminView = "dashboard" | "users" | "history";

const LEAF_COLORS = [
  "#4F7942",
  "#6B8E4E",
  "#8FAF5A",
  "#3E6B35",
  "#5C8A3C",
  "#7CA653",
];

const USERS_PER_PAGE = 10;
const HISTORY_PER_PAGE = 10;

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

const Leaf = React.memo(function Leaf({
  leaf,
}: {
  leaf: ReturnType<typeof useLeaves>[number];
}) {
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
});

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13h8V3H3v10Z" />
      <path d="M13 21h8v-8h-8v8Z" />
      <path d="M13 3h8v6h-8V3Z" />
      <path d="M3 17h8v4H3v-4Z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
      <path d="M3 4v4h4" />
      <path d="M3 8a9 9 0 0 1 3-3" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 15H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6 6-6" />
    </svg>
  );
}

function UsersCardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ActiveIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

function InactiveIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17L4 12" />
    </svg>
  );
}

function FailedIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6L18 18" />
    </svg>
  );
}

function StatCard({
  title,
  value,
  description,
  icon,
  loading,
}: {
  title: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div
      className="rounded-[22px] border border-white/10 p-6"
      style={{
        background: "rgba(150,190,120,0.07)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 20px 50px -25px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[#8FA080]" style={{ fontFamily: "Inter, sans-serif" }}>
            {title}
          </p>
          <p className="text-3xl text-[#EAF2DD] mt-2" style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>
            {loading ? "—" : value}
          </p>
          <p className="text-xs text-[#71806C] mt-2" style={{ fontFamily: "Inter, sans-serif" }}>
            {description}
          </p>
        </div>
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-[#A9C97C] border border-[#8FAF5A]/20"
          style={{ background: "rgba(143,175,90,0.08)" }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const leaves = useLeaves(26);

  // Which content shows on the right side. This is the ONLY thing that changes
  // when you click a sidebar menu item - the sidebar itself never re-renders/changes structure.
  const [activeView, setActiveView] = useState<AdminView>("dashboard");

  const [admin, setAdmin] = useState<LoggedInAdmin | null>(null);

  // ---- Users data ----
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [userPage, setUserPage] = useState(1);

  // ---- Login history data ----
  const [history, setHistory] = useState<LoginRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    const storedUser = localStorage.getItem("ayurvedai_user");
    if (storedUser) {
      try {
        const parsedUser: LoggedInAdmin = JSON.parse(storedUser);
        setAdmin(parsedUser);
      } catch (error) {
        console.error("Failed to read logged-in admin:", error);
      }
    }
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/api/admin/users");
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to fetch users");
        setUsers(data.users);
      } catch (error) {
        console.error("Failed to load users:", error);
      } finally {
        setUsersLoading(false);
      }
    };

    fetchUsers();
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/api/admin/login-history");
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to fetch login history");
        setHistory(data.history || []);
      } catch (error) {
        console.error("Failed to load login history:", error);
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const userStats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const user of users) {
      if (user.status === "active") active++;
      else inactive++;
    }
    return { total: users.length, active, inactive };
  }, [users]);

  const toggleStatus = useCallback(async (user: User) => {
    const newStatus = user.status === "active" ? "inactive" : "active";
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/admin/users/${user.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update user status");

      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === user.id ? { ...currentUser, status: newStatus } : currentUser
        )
      );
    } catch (error) {
      console.error("Failed to update user status:", error);
      alert("Unable to update user status.");
    }
  }, []);

  const deleteUser = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to delete user");

      setUsers((currentUsers) => currentUsers.filter((currentUser) => currentUser.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete user:", error);
      alert("Unable to delete user.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const filteredUsers = useMemo(() => {
    const searchTerm = userSearch.trim().toLowerCase();
    if (!searchTerm) return users;
    return users.filter(
      (user) => user.name.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm)
    );
  }, [users, userSearch]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));

  const paginatedUsers = useMemo(() => {
    const startIndex = (userPage - 1) * USERS_PER_PAGE;
    return filteredUsers.slice(startIndex, startIndex + USERS_PER_PAGE);
  }, [filteredUsers, userPage]);

  useEffect(() => {
    setUserPage(1);
  }, [userSearch]);

  useEffect(() => {
    if (userPage > totalUserPages) setUserPage(totalUserPages);
  }, [userPage, totalUserPages]);

  const filteredHistory = useMemo(() => {
    const searchTerm = historySearch.trim().toLowerCase();
    if (!searchTerm) return history;
    return history.filter(
      (item) =>
        item.email.toLowerCase().includes(searchTerm) ||
        item.status.toLowerCase().includes(searchTerm) ||
        (item.ip_address || "").toLowerCase().includes(searchTerm) ||
        (item.failure_reason || "").toLowerCase().includes(searchTerm)
    );
  }, [history, historySearch]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PER_PAGE));

  const paginatedHistory = useMemo(() => {
    const startIndex = (historyPage - 1) * HISTORY_PER_PAGE;
    return filteredHistory.slice(startIndex, startIndex + HISTORY_PER_PAGE);
  }, [filteredHistory, historyPage]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch]);

  useEffect(() => {
    if (historyPage > totalHistoryPages) setHistoryPage(totalHistoryPages);
  }, [historyPage, totalHistoryPages]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("ayurvedai_user");
    navigate("/login");
  }, [navigate]);

  const viewTitles: Record<AdminView, string> = {
    dashboard: "Dashboard",
    users: "Users",
    history: "Login History",
  };

  const viewSubtitles: Record<AdminView, string> = {
    dashboard: `Welcome back${admin?.name ? `, ${admin.name}` : ""}.`,
    users: "Manage registered users and account access.",
    history: "View user login activity and authentication attempts.",
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
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

        @keyframes modalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
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

        .leaf-field { perspective: 900px; transform-style: preserve-3d; }
        .delete-modal { animation: modalIn 0.2s ease-out; }

        @media (prefers-reduced-motion: reduce) {
          .leaf { animation: none; opacity: 0.5; }
          .delete-modal { animation: none; }
        }
      `}</style>

      <div className="leaf-field absolute inset-0 pointer-events-none">
        {leaves.map((leaf) => (
          <Leaf key={leaf.id} leaf={leaf} />
        ))}
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* ============ SIDEBAR - defined ONCE, never changes, never navigates away ============ */}
        <aside
          className="hidden lg:flex w-[250px] shrink-0 flex-col border-r border-white/10 p-6"
          style={{
            background: "rgba(10,23,16,0.65)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div className="mb-10">
            <img src={logo} alt="AyurvedAI" className="w-[145px] h-auto object-contain" />
          </div>

          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7E9077] mb-2" style={{ fontFamily: "Inter, sans-serif" }}>
              Administration
            </p>

            <h2 className="text-xl text-[#EAF2DD]" style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>
              Admin Panel
            </h2>

            {admin?.name && (
              <div
                className="mt-4 rounded-xl border border-[#8FAF5A]/15 px-3 py-3"
                style={{ background: "rgba(143,175,90,0.06)" }}
              >
                <p
                  className="text-[10px] leading-4 uppercase tracking-[0.14em] text-[#71806C] mb-1"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                >
                  Signed in as
                </p>
                <p
                  className="text-xs leading-4 text-[#A9C97C] font-medium truncate"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                >
                  {admin.name}
                </p>
              </div>
            )}
          </div>

          <nav className="space-y-2">
            <button
              type="button"
              onClick={() => setActiveView("dashboard")}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition"
              style={
                activeView === "dashboard"
                  ? { background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)", color: "#12200F" }
                  : { color: "#A6B399" }
              }
            >
              <DashboardIcon />
              <span
                className="text-sm"
                style={{ fontFamily: "Inter, sans-serif", fontWeight: activeView === "dashboard" ? 500 : 400 }}
              >
                Dashboard
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("users")}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition"
              style={
                activeView === "users"
                  ? { background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)", color: "#12200F" }
                  : { color: "#A6B399" }
              }
            >
              <UsersIcon />
              <span
                className="text-sm"
                style={{ fontFamily: "Inter, sans-serif", fontWeight: activeView === "users" ? 500 : 400 }}
              >
                Users
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("history")}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition"
              style={
                activeView === "history"
                  ? { background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)", color: "#12200F" }
                  : { color: "#A6B399" }
              }
            >
              <HistoryIcon />
              <span
                className="text-sm"
                style={{ fontFamily: "Inter, sans-serif", fontWeight: activeView === "history" ? 500 : 400 }}
              >
                Login History
              </span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-[#E8967A] hover:bg-[#E8967A]/10 transition"
            >
              <LogoutIcon />
              <span className="text-sm" style={{ fontFamily: "Inter, sans-serif" }}>
                Logout
              </span>
            </button>
          </nav>
        </aside>

        {/* ============ RIGHT SIDE - content swaps based on activeView ============ */}
        <main className="flex-1 min-w-0 p-5 sm:p-8 lg:p-10 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 mb-8">
              <div>
                <p className="text-sm text-[#8FAF5A] mb-1" style={{ fontFamily: "Inter, sans-serif" }}>
                  AyurvedAI Administration
                </p>
                <h1 className="text-3xl sm:text-4xl text-[#EAF2DD]" style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>
                  {viewTitles[activeView]}
                </h1>
                <p className="text-sm text-[#8FA080] mt-2" style={{ fontFamily: "Inter, sans-serif" }}>
                  {viewSubtitles[activeView]}
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/home")}
                className="rounded-xl border border-[#8FAF5A]/20 px-5 py-2.5 text-sm text-[#A9C97C] hover:bg-[#8FAF5A]/10 transition"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                View Website
              </button>
            </div>

            {/* -------- DASHBOARD VIEW -------- */}
            {activeView === "dashboard" && (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                <StatCard title="Total Users" value={userStats.total} description="Registered accounts" icon={<UsersCardIcon />} loading={usersLoading} />
                <StatCard title="Active Users" value={userStats.active} description="Currently enabled" icon={<ActiveIcon />} loading={usersLoading} />
                <StatCard title="Inactive Users" value={userStats.inactive} description="Currently disabled" icon={<InactiveIcon />} loading={usersLoading} />
              </div>
            )}

            {/* -------- USERS VIEW -------- */}
            {activeView === "users" && (
              <section
                className="rounded-[26px] border border-white/10 overflow-hidden"
                style={{
                  background: "rgba(150,190,120,0.07)",
                  backdropFilter: "blur(22px)",
                  WebkitBackdropFilter: "blur(22px)",
                  boxShadow: "0 25px 70px -25px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <div className="p-6 border-b border-white/10">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-xl text-[#EAF2DD]" style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>
                        All Users
                      </h2>
                      <p className="text-sm text-[#8FA080] mt-1" style={{ fontFamily: "Inter, sans-serif" }}>
                        View and manage all registered accounts.
                      </p>
                    </div>

                    <div className="relative w-full md:w-[280px]">
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search users..."
                        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-[#EAF2DD] placeholder-[#71806C] outline-none focus:border-[#8FAF5A]/60"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[750px]">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-[#71806C]">User</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-[#71806C]">Email</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-[#71806C]">Joined</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-[#71806C]">Status</th>
                        <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-[#71806C]">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {usersLoading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-sm text-[#8FA080]" style={{ fontFamily: "Inter, sans-serif" }}>
                            Loading users...
                          </td>
                        </tr>
                      ) : paginatedUsers.length > 0 ? (
                        paginatedUsers.map((user) => (
                          <tr key={user.id} className="border-b border-white/5 hover:bg-white/[0.025] transition">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-10 h-10 rounded-full flex items-center justify-center text-[#A9C97C] border border-[#8FAF5A]/20"
                                  style={{ background: "rgba(143,175,90,0.10)" }}
                                >
                                  {user.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-[#EAF2DD]" style={{ fontFamily: "Inter, sans-serif" }}>
                                    {user.name}
                                  </p>
                                  <p className="text-xs text-[#71806C] mt-1" style={{ fontFamily: "Inter, sans-serif" }}>
                                    ID #{user.id}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-5 text-sm text-[#A6B399]" style={{ fontFamily: "Inter, sans-serif" }}>
                              {user.email}
                            </td>

                            <td className="px-6 py-5 text-sm text-[#A6B399]" style={{ fontFamily: "Inter, sans-serif" }}>
                              {new Date(user.created_at).toLocaleDateString()}
                            </td>

                            <td className="px-6 py-5">
                              <button
                                type="button"
                                onClick={() => toggleStatus(user)}
                                className={`rounded-lg px-4 py-2 text-xs font-medium transition ${
                                  user.status === "active"
                                    ? "bg-[#8FAF5A]/10 text-[#A9C97C] border border-[#8FAF5A]/20 hover:bg-[#8FAF5A]/20"
                                    : "bg-[#E8967A]/10 text-[#E8967A] border border-[#E8967A]/20 hover:bg-[#E8967A]/20"
                                }`}
                                style={{ fontFamily: "Inter, sans-serif" }}
                              >
                                {user.status === "active" ? "Active" : "Inactive"}
                              </button>
                            </td>

                            <td className="px-6 py-5 text-right">
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(user)}
                                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium border border-red-500/20 text-red-400 hover:bg-red-500/10 transition"
                                style={{ fontFamily: "Inter, sans-serif" }}
                              >
                                <TrashIcon />
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : null}
                    </tbody>
                  </table>
                </div>

                {!usersLoading && filteredUsers.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-sm text-[#8FA080]" style={{ fontFamily: "Inter, sans-serif" }}>
                      No users found.
                    </p>
                  </div>
                )}

                {!usersLoading && filteredUsers.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-5 border-t border-white/10">
                    <p className="text-xs text-[#71806C]" style={{ fontFamily: "Inter, sans-serif" }}>
                      Showing <span className="text-[#A6B399]">{(userPage - 1) * USERS_PER_PAGE + 1}</span>
                      {" - "}
                      <span className="text-[#A6B399]">{Math.min(userPage * USERS_PER_PAGE, filteredUsers.length)}</span>
                      {" of "}
                      <span className="text-[#A6B399]">{filteredUsers.length}</span>
                      {" users"}
                    </p>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={userPage === 1}
                        onClick={() => setUserPage((page) => Math.max(1, page - 1))}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#A6B399] hover:bg-white/5 hover:text-[#EAF2DD] transition disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      >
                        <ChevronLeftIcon />
                        Previous
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalUserPages }, (_, index) => index + 1).map((page) => (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setUserPage(page)}
                            className={`w-9 h-9 rounded-lg text-xs font-medium transition ${
                              userPage === page ? "text-[#12200F]" : "text-[#A6B399] hover:bg-white/5 hover:text-[#EAF2DD]"
                            }`}
                            style={
                              userPage === page
                                ? { background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)", fontFamily: "Inter, sans-serif" }
                                : { fontFamily: "Inter, sans-serif" }
                            }
                          >
                            {page}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={userPage === totalUserPages}
                        onClick={() => setUserPage((page) => Math.min(totalUserPages, page + 1))}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#A6B399] hover:bg-white/5 hover:text-[#EAF2DD] transition disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      >
                        Next
                        <ChevronRightIcon />
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* -------- LOGIN HISTORY VIEW -------- */}
            {activeView === "history" && (
              <section
                className="rounded-[26px] border border-white/10 overflow-hidden"
                style={{
                  background: "rgba(150,190,120,0.07)",
                  backdropFilter: "blur(22px)",
                  WebkitBackdropFilter: "blur(22px)",
                  boxShadow: "0 25px 70px -25px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <div className="p-6 border-b border-white/10">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-xl text-[#EAF2DD]" style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>
                        Authentication Activity
                      </h2>
                      <p className="text-sm text-[#8FA080] mt-1" style={{ fontFamily: "Inter, sans-serif" }}>
                        All recorded login attempts.
                      </p>
                    </div>

                    <div className="relative w-full md:w-[280px]">
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search email, status, IP..."
                        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-[#EAF2DD] placeholder-[#71806C] outline-none focus:border-[#8FAF5A]/60"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px]">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-[#71806C]">User</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-[#71806C]">Date & Time</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-[#71806C]">IP Address</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-[#71806C]">Status</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-[#71806C]">Details</th>
                      </tr>
                    </thead>

                    <tbody>
                      {historyLoading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-sm text-[#8FA080]" style={{ fontFamily: "Inter, sans-serif" }}>
                            Loading login history...
                          </td>
                        </tr>
                      ) : paginatedHistory.length > 0 ? (
                        paginatedHistory.map((item) => (
                          <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.025] transition">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-[#A9C97C] border border-[#8FAF5A]/20"
                                  style={{ background: "rgba(143,175,90,0.10)" }}
                                >
                                  {item.email.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-[#EAF2DD] truncate max-w-[240px]" style={{ fontFamily: "Inter, sans-serif" }}>
                                    {item.email}
                                  </p>
                                  <p className="text-xs text-[#71806C] mt-1" style={{ fontFamily: "Inter, sans-serif" }}>
                                    {item.user_id ? `User ID #${item.user_id}` : "Unknown user"}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-5 text-sm text-[#A6B399]" style={{ fontFamily: "Inter, sans-serif" }}>
                              {new Date(item.login_at).toLocaleString()}
                            </td>

                            <td className="px-6 py-5 text-sm text-[#A6B399]" style={{ fontFamily: "Inter, sans-serif" }}>
                              {item.ip_address || "—"}
                            </td>

                            <td className="px-6 py-5">
                              {item.status === "success" ? (
                                <span className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium bg-[#8FAF5A]/10 text-[#A9C97C] border border-[#8FAF5A]/20">
                                  <SuccessIcon />
                                  Success
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium bg-[#E8967A]/10 text-[#E8967A] border border-[#E8967A]/20">
                                  <FailedIcon />
                                  Failed
                                </span>
                              )}
                            </td>

                            <td className="px-6 py-5 text-sm text-[#A6B399] max-w-[280px]" style={{ fontFamily: "Inter, sans-serif" }}>
                              {item.status === "failed" ? item.failure_reason || "Login failed" : "Successfully authenticated"}
                            </td>
                          </tr>
                        ))
                      ) : null}
                    </tbody>
                  </table>
                </div>

                {!historyLoading && filteredHistory.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-sm text-[#8FA080]" style={{ fontFamily: "Inter, sans-serif" }}>
                      No login history found.
                    </p>
                    {historySearch && (
                      <p className="text-xs text-[#71806C] mt-2" style={{ fontFamily: "Inter, sans-serif" }}>
                        Try a different search term.
                      </p>
                    )}
                  </div>
                )}

                {!historyLoading && filteredHistory.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-5 border-t border-white/10">
                    <p className="text-xs text-[#71806C]" style={{ fontFamily: "Inter, sans-serif" }}>
                      Showing <span className="text-[#A6B399]">{(historyPage - 1) * HISTORY_PER_PAGE + 1}</span>
                      {" - "}
                      <span className="text-[#A6B399]">{Math.min(historyPage * HISTORY_PER_PAGE, filteredHistory.length)}</span>
                      {" of "}
                      <span className="text-[#A6B399]">{filteredHistory.length}</span>
                      {" login records"}
                    </p>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={historyPage === 1}
                        onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#A6B399] hover:bg-white/5 hover:text-[#EAF2DD] transition disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      >
                        <ChevronLeftIcon />
                        Previous
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalHistoryPages }, (_, index) => index + 1).map((page) => (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setHistoryPage(page)}
                            className={`w-9 h-9 rounded-lg text-xs font-medium transition ${
                              historyPage === page ? "text-[#12200F]" : "text-[#A6B399] hover:bg-white/5 hover:text-[#EAF2DD]"
                            }`}
                            style={
                              historyPage === page
                                ? { background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)", fontFamily: "Inter, sans-serif" }
                                : { fontFamily: "Inter, sans-serif" }
                            }
                          >
                            {page}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={historyPage === totalHistoryPages}
                        onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#A6B399] hover:bg-white/5 hover:text-[#EAF2DD] transition disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      >
                        Next
                        <ChevronRightIcon />
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </main>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />

          <div
            className="delete-modal relative w-full max-w-md rounded-[26px] border border-white/10 p-7"
            style={{
              background: "rgba(20,42,28,0.90)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center justify-center mb-5">
              <div className="w-14 h-14 rounded-full flex items-center justify-center border border-red-500/20" style={{ background: "rgba(239,68,68,0.10)" }}>
                <span className="text-2xl text-red-400 font-semibold">!</span>
              </div>
            </div>

            <h2 className="text-2xl text-center text-[#EAF2DD]" style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>
              Delete User?
            </h2>

            <p className="text-center text-sm text-[#8FA080] mt-3 leading-6" style={{ fontFamily: "Inter, sans-serif" }}>
              Are you sure you want to delete <span className="text-[#A9C97C] font-medium">{deleteTarget.name}</span>?
              <br />
              This action cannot be undone.
            </p>

            <div className="flex gap-3 mt-7">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-[#8FAF5A]/25 px-5 py-3 text-sm font-medium text-[#A9C97C] hover:bg-[#8FAF5A]/10 transition disabled:opacity-50"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={deleteUser}
                className="flex-1 rounded-xl border border-red-500/25 bg-red-500/10 px-5 py-3 text-sm font-medium text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}