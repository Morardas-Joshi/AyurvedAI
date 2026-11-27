import { useMemo, useState } from "react";
import { api, downloadCsv, errorText, formatDate, splitList } from "./api";
import ImportCatalogModal from "./ImportCatalogModal";
import type { CatalogStatus, Herb } from "./types";
import { td, th, tr, useAdminData, useNotify, usePaged } from "./hooks";
import {
  Badge,
  CheckboxField,
  ConfirmDialog,
  EmptyRow,
  FilterTabs,
  IconButton,
  InfoNote,
  Modal,
  Pagination,
  Panel,
  PanelHeader,
  PrimaryButton,
  SearchInput,
  SecondaryButton,
  StatusBadge,
  TableShell,
  TextField,
} from "./ui";
import { Icons } from "./icons";

type Filter = "all" | CatalogStatus;

function HerbFormModal({ herb, onClose, onSaved }: { herb: Herb | null; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify();
  const [form, setForm] = useState({
    name_english: herb?.name_english ?? "",
    name_sanskrit: herb?.name_sanskrit ?? "",
    name_hindi: herb?.name_hindi ?? "",
    name_gujarati: herb?.name_gujarati ?? "",
    botanical_name: herb?.botanical_name ?? "",
    family: herb?.family ?? "",
    aliases: (herb?.aliases ?? []).join(", "),
    toxic: herb?.toxic ?? false,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.name_english.trim()) return setError("English name is required.");
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, name_english: form.name_english.trim(), aliases: splitList(form.aliases) };
      const data = herb
        ? await api<{ message: string }>(`/herbs/${encodeURIComponent(herb.slug)}`, { method: "PUT", json: payload })
        : await api<{ message: string }>("/herbs", { method: "POST", json: payload });
      notify("success", data.message);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      title={herb ? "Edit Herb" : "Add Herb"}
      subtitle={herb ? `Update the catalog details of ${herb.name_english ?? herb.slug}.` : "New herbs are saved as draft until you approve them."}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={saving} icon={<Icons.Check />}>{saving ? "Saving…" : herb ? "Save Changes" : "Add Herb"}</PrimaryButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="English name" value={form.name_english} onChange={set("name_english")} required maxLength={200} autoFocus />
        <TextField label="Sanskrit name" value={form.name_sanskrit} onChange={set("name_sanskrit")} maxLength={200} />
        <TextField label="Hindi name" value={form.name_hindi} onChange={set("name_hindi")} maxLength={200} />
        <TextField label="Gujarati name" value={form.name_gujarati} onChange={set("name_gujarati")} maxLength={200} />
        <TextField label="Botanical name" value={form.botanical_name} onChange={set("botanical_name")} maxLength={200} placeholder="e.g. Withania somnifera" />
        <TextField label="Plant family" value={form.family} onChange={set("family")} maxLength={120} placeholder="e.g. Solanaceae" />
        <div className="sm:col-span-2">
          <TextField label="Other names (aliases)" value={form.aliases} onChange={set("aliases")} hint="Separate names with commas" />
        </div>
        <div className="sm:col-span-2">
          <CheckboxField label="Mark as toxic / requires caution" checked={form.toxic} onChange={set("toxic")} hint="Users see an extra safety warning for this herb." />
        </div>
        {error && <p role="alert" className="rounded-lg border border-[#E8967A]/25 bg-[#E8967A]/10 px-3 py-2 text-sm text-[#F0B5A2] sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
}

export default function HerbCatalogView() {
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [formTarget, setFormTarget] = useState<Herb | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Herb | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, setData, loading, reload: load } = useAdminData<{ herbs: Herb[] }>("/herbs");
  const herbs = useMemo(() => data?.herbs ?? [], [data]);
  const setHerbs = (update: (current: Herb[]) => Herb[]) => setData((current) => current && { ...current, herbs: update(current.herbs) });

  const counts = useMemo(() => ({ all: herbs.length, approved: herbs.filter((h) => h.status === "approved").length, draft: herbs.filter((h) => h.status !== "approved").length }), [herbs]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return herbs.filter((herb) => {
      if (filter !== "all" && herb.status !== filter) return false;
      if (!term) return true;
      return [herb.name_english, herb.name_sanskrit, herb.name_hindi, herb.name_gujarati, herb.botanical_name, herb.family, ...herb.aliases].some((value) => (value ?? "").toLowerCase().includes(term));
    });
  }, [herbs, search, filter]);
  const paged = usePaged(filtered, 10, `${search}|${filter}`);

  const setStatus = async (herb: Herb, status: CatalogStatus) => {
    try {
      const data = await api<{ message: string }>(`/herbs/${encodeURIComponent(herb.slug)}/status`, { method: "PATCH", json: { status } });
      setHerbs((current) => current.map((item) => (item.slug === herb.slug ? { ...item, status } : item)));
      notify("success", `${herb.name_english ?? herb.slug}: ${data.message}`);
    } catch (err) {
      notify("error", errorText(err));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const data = await api<{ message: string }>(`/herbs/${encodeURIComponent(deleteTarget.slug)}`, { method: "DELETE" });
      setHerbs((current) => current.filter((item) => item.slug !== deleteTarget.slug));
      notify("success", data.message);
      setDeleteTarget(null);
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      "ayurvedai-herb-catalog",
      ["English name", "Sanskrit", "Hindi", "Gujarati", "Botanical name", "Family", "Aliases", "Toxic", "Status", "Updated"],
      filtered.map((h) => [h.name_english, h.name_sanskrit, h.name_hindi, h.name_gujarati, h.botanical_name, h.family, h.aliases.join("; "), h.toxic ? "Yes" : "No", h.status, formatDate(h.updated_at)]),
    );

  return (
    <div className="space-y-5">
      <InfoNote>
        Draft herbs are still shown to users with the label <span className="font-medium">"Draft, not yet reviewed"</span>. Approve a herb after checking its details to remove that label. Deleting a herb removes it from the catalog, cached profiles and saved comparisons.
      </InfoNote>
      <Panel>
        <PanelHeader
          title="All Herbs"
          subtitle="Add, edit, review and remove herbs shown in the Herb Information module."
          actions={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search any name" />
              <SecondaryButton onClick={exportCsv} icon={<Icons.Download />} disabled={!filtered.length}>Export CSV</SecondaryButton>
              <SecondaryButton onClick={() => setImportOpen(true)} icon={<Icons.Upload />}>Import</SecondaryButton>
              <PrimaryButton onClick={() => setFormTarget("new")} icon={<Icons.Plus />}>Add Herb</PrimaryButton>
            </>
          }
        />
        <div className="border-b border-white/10 px-6 py-3">
          <FilterTabs<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "approved", label: "Approved", count: counts.approved },
              { value: "draft", label: "Draft", count: counts.draft },
            ]}
          />
        </div>
        <TableShell minWidth={980}>
          <thead>
            <tr className="border-b border-white/10">
              <th className={th}>Herb</th>
              <th className={th}>Botanical name</th>
              <th className={th}>Family</th>
              <th className={th}>Safety</th>
              <th className={th}>Status</th>
              <th className={th}>Updated</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading || !paged.pageItems.length ? (
              <EmptyRow colSpan={7} loading={loading} text={search || filter !== "all" ? "No herbs match your filters." : "No herbs in the catalog yet."} />
            ) : (
              paged.pageItems.map((herb) => (
                <tr key={herb.slug} className={tr}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#8FAF5A]/20 bg-[#8FAF5A]/10 text-[#A9C97C]"><Icons.Leaf /></div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#EAF2DD]">{herb.name_english ?? herb.slug}</p>
                        <p className="mt-0.5 max-w-[220px] truncate text-xs text-[#71806C]">{[herb.name_sanskrit, herb.name_hindi].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className={`${td} italic`}>{herb.botanical_name || "—"}</td>
                  <td className={td}>{herb.family || "—"}</td>
                  <td className={td}>{herb.toxic ? <Badge tone="red" icon={<Icons.Alert size={12} />}>Toxic</Badge> : <span className="text-[#71806C]">—</span>}</td>
                  <td className={td}><StatusBadge status={herb.status} /></td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(herb.updated_at)}</td>
                  <td className={td}>
                    <div className="flex justify-end gap-2">
                      {herb.status === "approved" ? (
                        <IconButton label="Move to draft" tone="amber" onClick={() => void setStatus(herb, "draft")}><Icons.X /></IconButton>
                      ) : (
                        <IconButton label="Approve" onClick={() => void setStatus(herb, "approved")}><Icons.Check /></IconButton>
                      )}
                      <IconButton label={`Edit ${herb.name_english ?? herb.slug}`} onClick={() => setFormTarget(herb)}><Icons.Edit /></IconButton>
                      <IconButton label={`Delete ${herb.name_english ?? herb.slug}`} tone="red" onClick={() => setDeleteTarget(herb)}><Icons.Trash /></IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
        <Pagination {...paged} total={filtered.length} noun="herbs" onChange={paged.setPage} />
      </Panel>

      {formTarget && <HerbFormModal herb={formTarget === "new" ? null : formTarget} onClose={() => setFormTarget(null)} onSaved={() => void load()} />}
      {importOpen && <ImportCatalogModal onClose={() => setImportOpen(false)} onImported={() => void load()} />}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Herb?"
          message={<>Delete <span className="font-medium text-[#A9C97C]">{deleteTarget.name_english ?? deleteTarget.slug}</span>? It will be removed from the herb catalog, cached AI profiles and saved comparisons. If you only want it reviewed again, use "Move to draft" instead.</>}
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
