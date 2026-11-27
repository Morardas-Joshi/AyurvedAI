import type { ReactNode } from "react";
import { formatDateTime } from "./api";
import { useAdminData } from "./hooks";
import type { HealthCheck, HealthReport } from "./types";
import { Panel, PanelHeader, SecondaryButton } from "./ui";
import { Icons } from "./icons";

const STATUS_META: Record<HealthCheck["status"], { label: string; className: string; icon: ReactNode }> = {
  ok: { label: "Operational", className: "text-[#A9C97C] border-[#8FAF5A]/30 bg-[#8FAF5A]/10", icon: <Icons.Check /> },
  warning: { label: "Needs attention", className: "text-[#E6D49A] border-[#E0C985]/30 bg-[#E0C985]/10", icon: <Icons.Alert /> },
  error: { label: "Not working", className: "text-[#F0A88F] border-[#E8967A]/30 bg-[#E8967A]/10", icon: <Icons.X /> },
};

const OVERALL_TEXT: Record<HealthReport["overall"], string> = {
  ok: "All systems operational",
  warning: "Some services need attention",
  error: "One or more services are not working",
};

export default function SystemHealthView() {
  const { data: report, error, loading: firstLoad, refreshing, reload: load } = useAdminData<HealthReport>("/health");
  const loading = firstLoad || refreshing;

  const overall = report ? STATUS_META[report.overall] : null;

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="System Status"
          subtitle={report ? `Last checked ${formatDateTime(report.checked_at)}` : "Checking services…"}
          actions={<SecondaryButton onClick={load} disabled={loading} icon={<Icons.Refresh />}>{loading ? "Checking…" : "Refresh"}</SecondaryButton>}
        />
        <div className="p-6">
          {error && !report ? (
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${STATUS_META.error.className}`}>
              {STATUS_META.error.icon}
              <span>Backend not reachable: {error}</span>
            </div>
          ) : report && overall ? (
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${overall.className}`}>
              {overall.icon}
              <span>{OVERALL_TEXT[report.overall]}</span>
              <span className="ml-auto text-xs font-normal opacity-80">
                {report.checks.filter((c) => c.status === "ok").length} of {report.checks.length} checks passing
              </span>
            </div>
          ) : (
            <p className="text-sm text-[#8FA080]">Loading…</p>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {report?.checks.map((check) => {
          const meta = STATUS_META[check.status];
          return (
            <Panel key={check.key} padded>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-medium text-[#EAF2DD]">{check.name}</h3>
                  <p className="mt-1.5 text-sm leading-5 text-[#8FA080]">{check.detail}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
                  {meta.icon}
                  {meta.label}
                </span>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
