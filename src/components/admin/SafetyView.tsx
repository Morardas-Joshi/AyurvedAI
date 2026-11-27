import { useMemo, useState } from "react";
import { api, downloadCsv, errorText, formatDateTime, titleCase } from "./api";
import { BarList } from "./charts";
import type { SafetyEvent, SafetyRulesInfo } from "./types";
import { td, th, tr, useAdminData, useMountTime, useNotify, usePaged } from "./hooks";
import {
  Badge,
  ConfirmDialog,
  DangerButton,
  EmptyRow,
  FilterTabs,
  IconButton,
  Modal,
  Pagination,
  Panel,
  PanelHeader,
  SearchInput,
  SecondaryButton,
  StatCard,
  TableShell,
  TextField,
} from "./ui";
import { Icons } from "./icons";

const PHONE_LABELS: Record<string, string> = { emergency: "Emergency", ambulance: "Ambulance", mental_health: "Tele-MANAS (mental health)" };

export function LevelBadge({ level }: { level: string }) {
  if (level === "emergency" || level === "critical") return <Badge tone="red" icon={<Icons.Alert size={12} />}>{titleCase(level)}</Badge>;
  if (level === "warning") return <Badge tone="amber" icon={<Icons.Alert size={12} />}>Warning</Badge>;
  return <Badge tone="gray">{titleCase(level)}</Badge>;
}

export default function SafetyView() {
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<SafetyEvent | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);

  const { data, setData, loading, reload: load } = useAdminData<{ events: SafetyEvent[]; rules: SafetyRulesInfo }>("/safety/events");
  const events = useMemo(() => data?.events ?? [], [data]);
  const setEvents = (update: (current: SafetyEvent[]) => SafetyEvent[]) => setData((current) => current && { ...current, events: update(current.events) });
  const rules = data?.rules ?? null;

  const levels = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => counts.set(event.level, (counts.get(event.level) ?? 0) + 1));
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [events]);
  const contexts = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => counts.set(event.context, (counts.get(event.context) ?? 0) + 1));
    return [...counts.entries()].map(([label, count]) => ({ label: titleCase(label), count })).sort((a, b) => b.count - a.count);
  }, [events]);

  const now = useMountTime();
  const weekAgo = now - 7 * 86400000;
  const lastWeek = events.filter((event) => event.created_at && new Date(event.created_at).getTime() >= weekAgo).length;
  const emergencies = events.filter((event) => event.level === "emergency" || event.level === "critical").length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => (level === "all" || event.level === level) && (!term || [event.context, ...event.flags].some((value) => value.toLowerCase().includes(term))));
  }, [events, level, search]);
  const paged = usePaged(filtered, 10, `${search}|${level}`);

  const daysNumber = Number(days);
  const daysValid = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 3650;
  const affected = daysValid ? events.filter((event) => event.created_at && new Date(event.created_at).getTime() < now - daysNumber * 86400000).length : 0;

  const removeOne = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const data = await api<{ message: string }>(`/safety/events/${deleteTarget.id}`, { method: "DELETE" });
      setEvents((current) => current.filter((item) => item.id !== deleteTarget.id));
      notify("success", data.message);
      setDeleteTarget(null);
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const clearOld = async () => {
    setBusy(true);
    try {
      const data = await api<{ message: string }>(`/safety/events?older_than_days=${daysNumber}`, { method: "DELETE" });
      notify("success", data.message);
      setClearOpen(false);
      load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Alerts" value={events.length} description="All recorded safety events" icon={<Icons.Shield size={22} />} loading={loading} />
        <StatCard title="Last 7 Days" value={lastWeek} description="Recent safety events" icon={<Icons.History size={22} />} loading={loading} tone={lastWeek ? "amber" : "green"} />
        <StatCard title="Emergencies" value={emergencies} description="Emergency-level detections" icon={<Icons.Alert size={22} />} loading={loading} tone={emergencies ? "red" : "green"} />
        <StatCard title="Rules Version" value={rules?.version ?? "—"} description={rules ? `${rules.emergency_patterns ?? 0} emergency · ${rules.unsafe_patterns ?? 0} unsafe patterns` : ""} icon={<Icons.Check size={22} />} loading={loading} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel padded>
          <h3 className="font-admin-display text-lg text-[#EAF2DD]">Alerts by Level</h3>
          <div className="mt-4"><BarList items={levels} emptyText="No safety events recorded." /></div>
        </Panel>
        <Panel padded>
          <h3 className="font-admin-display text-lg text-[#EAF2DD]">Alerts by Module</h3>
          <div className="mt-4"><BarList items={contexts} emptyText="No safety events recorded." /></div>
        </Panel>
        <Panel padded>
          <h3 className="font-admin-display text-lg text-[#EAF2DD]">Active Safety Rules</h3>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[#8FA080]">Special groups</dt><dd className="text-right capitalize text-[#D5DFC9]">{rules?.special_groups?.join(", ") || "—"}</dd></div>
            {Object.entries(rules?.phone_numbers ?? {}).map(([key, number]) => (
              <div key={key} className="flex justify-between gap-3"><dt className="text-[#8FA080]">{PHONE_LABELS[key] ?? titleCase(key)}</dt><dd className="font-medium text-[#D5DFC9]">{number}</dd></div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Safety Event Log"
          subtitle="Emergency, pregnancy, dosage and other risky requests detected by the safety filter. Message text is never stored."
          actions={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search flag or module" />
              <SecondaryButton
                icon={<Icons.Download />}
                disabled={!filtered.length}
                onClick={() => downloadCsv("ayurvedai-safety-events", ["Date & time", "Module", "Level", "Flags", "User reference"], filtered.map((e) => [formatDateTime(e.created_at), e.context, e.level, e.flags.join("; "), e.user_hash ?? "guest"]))}
              >
                Export CSV
              </SecondaryButton>
              <DangerButton onClick={() => setClearOpen(true)} icon={<Icons.Trash />}>Clear Old Events</DangerButton>
            </>
          }
        />
        <div className="border-b border-white/10 px-6 py-3">
          <FilterTabs value={level} onChange={setLevel} options={[{ value: "all", label: "All", count: events.length }, ...levels.map((item) => ({ value: item.label, label: titleCase(item.label), count: item.count }))]} />
        </div>
        <TableShell minWidth={800}>
          <thead>
            <tr className="border-b border-white/10">
              <th className={th}>Date & Time</th>
              <th className={th}>Module</th>
              <th className={th}>Level</th>
              <th className={th}>Flags</th>
              <th className={th}>User reference</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading || !paged.pageItems.length ? (
              <EmptyRow colSpan={6} loading={loading} text={search || level !== "all" ? "No events match your filters." : "No safety events recorded."} />
            ) : (
              paged.pageItems.map((event) => (
                <tr key={event.id} className={tr}>
                  <td className={`${td} whitespace-nowrap`}>{formatDateTime(event.created_at)}</td>
                  <td className={td}>{titleCase(event.context)}</td>
                  <td className={td}><LevelBadge level={event.level} /></td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1.5">
                      {event.flags.length ? event.flags.map((flag) => <Badge key={flag} tone="gray">{titleCase(flag)}</Badge>) : "—"}
                    </div>
                  </td>
                  <td className={`${td} font-mono text-xs`}>{event.user_hash ?? "guest"}</td>
                  <td className={td}>
                    <div className="flex justify-end">
                      <IconButton label="Delete event" tone="red" onClick={() => setDeleteTarget(event)}><Icons.Trash /></IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
        <Pagination {...paged} total={filtered.length} noun="events" onChange={paged.setPage} />
      </Panel>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Safety Event?"
          message={<>Delete the <span className="font-medium text-[#A9C97C]">{deleteTarget.level}</span> event from {formatDateTime(deleteTarget.created_at)}?</>}
          busy={busy}
          onConfirm={() => void removeOne()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {clearOpen && (
        <Modal
          title="Clear Old Safety Events"
          subtitle="Permanently delete safety events older than the number of days below."
          onClose={() => setClearOpen(false)}
          busy={busy}
          footer={
            <>
              <SecondaryButton onClick={() => setClearOpen(false)} disabled={busy}>Cancel</SecondaryButton>
              <DangerButton onClick={() => void clearOld()} disabled={busy || !daysValid || affected === 0} icon={<Icons.Trash />}>
                {busy ? "Deleting…" : `Delete ${affected} event${affected === 1 ? "" : "s"}`}
              </DangerButton>
            </>
          }
        >
          <div className="space-y-4">
            <TextField label="Older than (days)" type="number" value={days} onChange={setDays} required hint="Between 1 and 3650 days" />
            <p className="text-sm text-[#B7C4A9]">
              {!daysValid ? "Enter a whole number of days between 1 and 3650." : affected ? <><span className="font-medium text-[#E8967A]">{affected}</span> event{affected === 1 ? "" : "s"} will be permanently deleted. This action cannot be undone.</> : "No events are older than this period."}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
