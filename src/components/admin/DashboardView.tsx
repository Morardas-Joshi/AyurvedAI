import { percent, timeAgo } from "./api";
import { BarList, ColumnChart, DailyLoginChart } from "./charts";
import { useAdminData } from "./hooks";
import type { AdminView, Summary } from "./types";
import { Panel, PanelHeader, SecondaryButton, StatCard } from "./ui";
import { Icons } from "./icons";

const ACTIVITY_STYLE: Record<string, { label: string; className: string }> = {
  login_success: { label: "Login", className: "text-[#A9C97C] border-[#8FAF5A]/25 bg-[#8FAF5A]/10" },
  login_failed: { label: "Failed", className: "text-[#E2A6D9] border-[#CF70C1]/25 bg-[#CF70C1]/10" },
  registration: { label: "New user", className: "text-[#9CC9E0] border-[#7DB3CF]/25 bg-[#7DB3CF]/10" },
  safety: { label: "Safety", className: "text-[#E6D49A] border-[#E0C985]/25 bg-[#E0C985]/10" },
};

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "short" });
}

export default function DashboardView({ onNavigate }: { onNavigate: (view: AdminView) => void }) {
  const { data: summary, loading, error, reload: load } = useAdminData<Summary>("/summary");

  const s = summary;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8967A]/25 bg-[#E8967A]/10 px-4 py-3 text-sm text-[#F0B5A2]">
          <span>Could not load dashboard data: {error}</span>
          <SecondaryButton onClick={load} icon={<Icons.Refresh />}>Retry</SecondaryButton>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Users" value={s?.users.total ?? 0} description={s ? `${s.users.active} active · ${s.users.inactive} inactive` : ""} icon={<Icons.Users size={22} />} loading={loading && !s} onClick={() => onNavigate("users")} />
        <StatCard title="Active Users" value={s?.users.active ?? 0} description={s ? `${percent(s.users.active, s.users.total)} of all accounts` : ""} icon={<Icons.Check size={22} />} loading={loading && !s} onClick={() => onNavigate("users")} />
        <StatCard title="Inactive Users" value={s?.users.inactive ?? 0} description="Accounts currently disabled" icon={<Icons.X size={22} />} loading={loading && !s} tone={s?.users.inactive ? "amber" : "green"} onClick={() => onNavigate("users")} />
        <StatCard title="Failed Logins Today" value={s?.logins.failed_today ?? 0} description={s ? `${s.logins.failed} failed of ${s.logins.total} total attempts` : ""} icon={<Icons.Alert size={22} />} loading={loading && !s} tone={s?.logins.failed_today ? "red" : "green"} onClick={() => onNavigate("logins")} />
        <StatCard title="Knowledge Base" value={s?.knowledge_base.files ?? 0} description={s ? `Documents · ${s.knowledge_base.chunks} indexed chunks` : ""} icon={<Icons.Documents size={22} />} loading={loading && !s} onClick={() => onNavigate("knowledge")} />
        <StatCard title="Herbs" value={s?.herbs.total ?? 0} description={s ? `${s.herbs.approved} approved · ${s.herbs.draft} draft` : ""} icon={<Icons.Leaf size={22} />} loading={loading && !s} onClick={() => onNavigate("herbs")} />
        <StatCard title="Medicines" value={s?.medicines.total ?? 0} description={s ? `${s.medicines.approved} approved · ${s.medicines.draft} draft` : ""} icon={<Icons.Medicine size={22} />} loading={loading && !s} onClick={() => onNavigate("medicines")} />
        <StatCard title="Safety Alerts" value={s?.safety.last_7_days ?? 0} description={s ? `Last 7 days · ${s.safety.total} recorded in total` : ""} icon={<Icons.Shield size={22} />} loading={loading && !s} tone={s?.safety.last_7_days ? "amber" : "green"} onClick={() => onNavigate("safety")} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Login Activity" subtitle="Sign-in attempts per day, last 30 days" />
          <div className="p-6">{s ? <DailyLoginChart data={s.logins.per_day} /> : <p className="text-sm text-[#8FA080]">{loading ? "Loading…" : "No data."}</p>}</div>
        </Panel>
        <Panel>
          <PanelHeader title="Login Outcomes" subtitle="All recorded attempts" />
          <div className="space-y-6 p-6">
            {s && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs text-[#8FA080]">Success rate</p>
                    <p className="font-admin-display mt-1 text-2xl text-[#EAF2DD]">{percent(s.logins.success, s.logins.total)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs text-[#8FA080]">Total attempts</p>
                    <p className="font-admin-display mt-1 text-2xl text-[#EAF2DD]">{s.logins.total}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-xs uppercase tracking-wider text-[#71806C]">Failure reasons</p>
                  <BarList items={s.logins.failure_reasons.map((item) => ({ label: item.reason, count: item.count }))} color="#CF70C1" emptyText="No failed logins recorded." />
                </div>
              </>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel>
          <PanelHeader title="New Registrations" subtitle="Accounts created per month" />
          <div className="p-6">{s && <ColumnChart label="Registrations per month" data={s.registrations_per_month.map((item) => ({ label: monthLabel(item.month), count: item.count }))} />}</div>
        </Panel>
        <Panel>
          <PanelHeader title="Content Overview" subtitle="Records managed from this panel" />
          <div className="p-6">
            {s && (
              <BarList
                items={[
                  { label: "Herbs", count: s.herbs.total },
                  { label: "Medicines", count: s.medicines.total },
                  { label: "Food rules", count: s.food_rules.total },
                  { label: "Routine items", count: s.routine_items.total },
                  { label: "Saved lifestyle plans", count: s.lifestyle_plans.total },
                  { label: "Verified clinics", count: s.clinics.total },
                ]}
              />
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Recent Activity" subtitle="Latest events across the platform" />
          <ul className="max-h-[330px] divide-y divide-white/5 overflow-y-auto">
            {s?.recent_activity.length ? (
              s.recent_activity.map((item, index) => {
                const style = ACTIVITY_STYLE[item.type] ?? ACTIVITY_STYLE.login_success;
                return (
                  <li key={`${item.at}-${index}`} className="flex items-start gap-3 px-6 py-3">
                    <span className={`mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style.className}`}>{style.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#D5DFC9]">{item.title}</p>
                      {item.detail && <p className="truncate text-xs text-[#71806C]">{item.detail}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] text-[#71806C]">{timeAgo(item.at)}</span>
                  </li>
                );
              })
            ) : (
              <li className="px-6 py-8 text-sm text-[#8FA080]">{loading ? "Loading…" : "No activity yet."}</li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
