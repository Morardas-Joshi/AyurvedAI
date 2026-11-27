import { useMemo, useState } from "react";
import { api, describeDevice, downloadCsv, errorText, formatDateTime } from "./api";
import type { LoginRecord } from "./types";
import { td, th, tr, useAdminData, useMountTime, useNotify, usePaged } from "./hooks";
import {
  Avatar,
  Badge,
  DangerButton,
  EmptyRow,
  FilterTabs,
  Modal,
  Pagination,
  Panel,
  PanelHeader,
  SearchInput,
  SecondaryButton,
  TableShell,
  TextField,
} from "./ui";
import { Icons } from "./icons";

type OutcomeFilter = "all" | "success" | "failed";

export default function LoginActivityView() {
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OutcomeFilter>("all");
  const [clearOpen, setClearOpen] = useState(false);
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);

  const { data, loading, reload: load } = useAdminData<{ history: LoginRecord[] }>("/login-history");
  const records = useMemo(() => data?.history ?? [], [data]);

  const counts = useMemo(() => ({ all: records.length, success: records.filter((r) => r.status === "success").length, failed: records.filter((r) => r.status !== "success").length }), [records]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!term) return true;
      return [item.email, item.ip_address, item.failure_reason, describeDevice(item.user_agent)].some((value) => (value ?? "").toLowerCase().includes(term));
    });
  }, [records, search, filter]);
  const paged = usePaged(filtered, 10, `${search}|${filter}`);

  const daysNumber = Number(days);
  const daysValid = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 3650;
  const now = useMountTime();
  const affected = useMemo(() => {
    if (!daysValid) return 0;
    const cutoff = now - daysNumber * 86400000;
    return records.filter((item) => new Date(item.login_at).getTime() < cutoff).length;
  }, [records, daysNumber, daysValid, now]);

  const clearOld = async () => {
    setBusy(true);
    try {
      const data = await api<{ message: string }>(`/login-history?older_than_days=${daysNumber}`, { method: "DELETE" });
      notify("success", data.message);
      setClearOpen(false);
      load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      "ayurvedai-login-activity",
      ["Date & time", "Email", "User ID", "IP address", "Device", "Status", "Details", "User agent"],
      filtered.map((item) => [formatDateTime(item.login_at), item.email, item.user_id ?? "", item.ip_address ?? "", describeDevice(item.user_agent), item.status, item.status === "success" ? "Successfully authenticated" : item.failure_reason ?? "Login failed", item.user_agent ?? ""]),
    );

  return (
    <>
      <Panel>
        <PanelHeader
          title="Authentication Activity"
          subtitle="Every sign-in attempt by users and administrators."
          actions={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search email, IP, device" />
              <SecondaryButton onClick={exportCsv} icon={<Icons.Download />} disabled={!filtered.length}>Export CSV</SecondaryButton>
              <DangerButton onClick={() => setClearOpen(true)} icon={<Icons.Trash />}>Clear Old Records</DangerButton>
            </>
          }
        />
        <div className="border-b border-white/10 px-6 py-3">
          <FilterTabs<OutcomeFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "success", label: "Successful", count: counts.success },
              { value: "failed", label: "Failed", count: counts.failed },
            ]}
          />
        </div>
        <TableShell minWidth={1000}>
          <thead>
            <tr className="border-b border-white/10">
              <th className={th}>User</th>
              <th className={th}>Date & Time</th>
              <th className={th}>IP Address</th>
              <th className={th}>Device</th>
              <th className={th}>Status</th>
              <th className={th}>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading || !paged.pageItems.length ? (
              <EmptyRow colSpan={6} loading={loading} text={search || filter !== "all" ? "No records match your filters." : "No login activity recorded yet."} />
            ) : (
              paged.pageItems.map((item) => (
                <tr key={item.id} className={tr}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <Avatar text={item.email} />
                      <div className="min-w-0">
                        <p className="max-w-[240px] truncate font-medium text-[#EAF2DD]">{item.email}</p>
                        <p className="mt-0.5 text-xs text-[#71806C]">{item.user_id ? `User ID #${item.user_id}` : "Administrator / unknown"}</p>
                      </div>
                    </div>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{formatDateTime(item.login_at)}</td>
                  <td className={td}>{item.ip_address || "—"}</td>
                  <td className={td}>
                    <span title={item.user_agent ?? ""}>{describeDevice(item.user_agent)}</span>
                  </td>
                  <td className={td}>
                    {item.status === "success" ? <Badge tone="green" icon={<Icons.Check size={12} />}>Success</Badge> : <Badge tone="violet" icon={<Icons.X size={12} />}>Failed</Badge>}
                  </td>
                  <td className={`${td} max-w-[260px]`}>{item.status === "success" ? "Successfully authenticated" : item.failure_reason || "Login failed"}</td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
        <Pagination {...paged} total={filtered.length} noun="login records" onChange={paged.setPage} />
      </Panel>

      {clearOpen && (
        <Modal
          title="Clear Old Login Records"
          subtitle="Permanently delete login records older than the number of days below."
          onClose={() => setClearOpen(false)}
          busy={busy}
          footer={
            <>
              <SecondaryButton onClick={() => setClearOpen(false)} disabled={busy}>Cancel</SecondaryButton>
              <DangerButton onClick={() => void clearOld()} disabled={busy || !daysValid || affected === 0} icon={<Icons.Trash />}>
                {busy ? "Deleting…" : `Delete ${affected} record${affected === 1 ? "" : "s"}`}
              </DangerButton>
            </>
          }
        >
          <div className="space-y-4">
            <TextField label="Older than (days)" type="number" value={days} onChange={setDays} required hint="Between 1 and 3650 days" />
            <p className="text-sm text-[#B7C4A9]">
              {daysValid ? (
                affected ? (
                  <><span className="font-medium text-[#E8967A]">{affected}</span> record{affected === 1 ? "" : "s"} will be permanently deleted. This action cannot be undone.</>
                ) : (
                  "No records are older than this period."
                )
              ) : (
                "Enter a whole number of days between 1 and 3650."
              )}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
