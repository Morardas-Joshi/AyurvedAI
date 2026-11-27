import { useMemo, useState } from "react";
import { api, downloadCsv, errorText, formatDate, splitList, titleCase } from "./api";
import ImportCatalogModal from "./ImportCatalogModal";
import type { CatalogStatus, Medicine, SourceItem } from "./types";
import { td, th, tr, useAdminData, useNotify, usePaged } from "./hooks";
import {
  Badge,
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
  SelectField,
  StatusBadge,
  TableShell,
  TextAreaField,
  TextField,
} from "./ui";
import { Icons } from "./icons";

type Filter = "all" | CatalogStatus;
const MINING_THRESHOLD = 20;

function MedicineFormModal({
  medicine,
  forms,
  sources,
  onClose,
  onSaved,
}: {
  medicine: Medicine | null;
  forms: string[];
  sources: SourceItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const notify = useNotify();
  const [name, setName] = useState(medicine?.name ?? "");
  const [form, setForm] = useState(medicine?.form ?? "churna");
  const [ingredients, setIngredients] = useState((medicine?.ingredients ?? []).join(", "));
  const [aliases, setAliases] = useState((medicine?.aliases ?? []).join(", "));
  const [summary, setSummary] = useState(medicine?.summary ?? "");
  const [selectedSources, setSelectedSources] = useState<string[]>((medicine?.source_ids ?? []).map(String));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const formOptions = useMemo(() => {
    const all = new Set([...forms, form]);
    return [...all].map((value) => ({ value, label: titleCase(value) }));
  }, [forms, form]);

  const knownValues = new Set(sources.map((source) => String(source.value)));
  const orphanSources = selectedSources.filter((value) => !knownValues.has(value));

  const toggleSource = (value: string) =>
    setSelectedSources((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));

  const save = async () => {
    if (!name.trim()) return setError("Medicine name is required.");
    if (!selectedSources.length) return setError("Select at least one reference source.");
    setSaving(true);
    setError("");
    try {
      const sourceIds = selectedSources.map((value) => (/^\d+$/.test(value) ? Number(value) : value));
      const payload = { name: name.trim(), form, ingredients: splitList(ingredients), aliases: splitList(aliases), source_ids: sourceIds, summary: summary.trim() || null };
      const data = medicine
        ? await api<{ message: string }>(`/medicines/${encodeURIComponent(medicine.slug)}`, { method: "PUT", json: payload })
        : await api<{ message: string }>("/medicines", { method: "POST", json: payload });
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
      title={medicine ? "Edit Medicine" : "Add Medicine"}
      subtitle={medicine ? `Update the catalog details of ${medicine.name}.` : "New medicines are saved as draft until you approve them."}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={saving} icon={<Icons.Check />}>{saving ? "Saving…" : medicine ? "Save Changes" : "Add Medicine"}</PrimaryButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Medicine name" value={name} onChange={setName} required maxLength={200} autoFocus placeholder="e.g. Triphala churna" />
        <SelectField label="Preparation form" value={form} onChange={setForm} options={formOptions} required />
        <div className="sm:col-span-2">
          <TextField label="Ingredients" value={ingredients} onChange={setIngredients} hint="Separate ingredients with commas" />
        </div>
        <div className="sm:col-span-2">
          <TextField label="Other names (aliases)" value={aliases} onChange={setAliases} hint="Separate names with commas" />
        </div>
        <div className="sm:col-span-2">
          <TextAreaField label="Short summary" value={summary} onChange={setSummary} maxLength={2000} hint="Shown to users as the medicine overview (optional)" />
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-xs uppercase tracking-wider text-[#8FA080]">
            Reference sources<span className="ml-0.5 text-[#E8967A]">*</span>
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2">
            {sources.map((source) => {
              const value = String(source.value);
              return (
                <label key={source.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <input type="checkbox" checked={selectedSources.includes(value)} onChange={() => toggleSource(value)} className="mt-0.5 h-4 w-4 accent-[#7CA653]" />
                  <span className="min-w-0 text-xs leading-5">
                    <span className="block text-[#D5DFC9]">{source.title} <span className="text-[#71806C]">({value})</span></span>
                    {source.note && <span className="block truncate text-[#71806C]">{source.note}</span>}
                  </span>
                </label>
              );
            })}
            {orphanSources.map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
                <input type="checkbox" checked onChange={() => toggleSource(value)} className="h-4 w-4 accent-[#7CA653]" />
                <span className="text-xs text-[#D5DFC9]">{value}</span>
              </label>
            ))}
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg border border-[#E8967A]/25 bg-[#E8967A]/10 px-3 py-2 text-sm text-[#F0B5A2] sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
}

export default function MedicineCatalogView() {
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [formTarget, setFormTarget] = useState<Medicine | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Medicine | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, setData, loading, reload: load } = useAdminData<{ medicines: Medicine[]; forms: string[] }>("/medicines");
  const sourceData = useAdminData<{ sources: SourceItem[] }>("/sources").data;
  const medicines = useMemo(() => data?.medicines ?? [], [data]);
  const setMedicines = (update: (current: Medicine[]) => Medicine[]) => setData((current) => current && { ...current, medicines: update(current.medicines) });
  const forms = data?.forms ?? [];
  const sources = sourceData?.sources ?? [];

  const approved = medicines.filter((m) => m.status === "approved").length;
  const counts = { all: medicines.length, approved, draft: medicines.length - approved };
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return medicines.filter((m) => {
      if (filter !== "all" && m.status !== filter) return false;
      if (!term) return true;
      return [m.name, m.form, ...m.aliases, ...m.ingredients].some((value) => value.toLowerCase().includes(term));
    });
  }, [medicines, search, filter]);
  const paged = usePaged(filtered, 10, `${search}|${filter}`);

  const setStatus = async (medicine: Medicine, status: CatalogStatus) => {
    try {
      const data = await api<{ message: string }>(`/medicines/${encodeURIComponent(medicine.slug)}/status`, { method: "PATCH", json: { status } });
      setMedicines((current) => current.map((item) => (item.slug === medicine.slug ? { ...item, status } : item)));
      notify("success", `${medicine.name}: ${data.message}`);
    } catch (err) {
      notify("error", errorText(err));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const data = await api<{ message: string }>(`/medicines/${encodeURIComponent(deleteTarget.slug)}`, { method: "DELETE" });
      setMedicines((current) => current.filter((item) => item.slug !== deleteTarget.slug));
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
      "ayurvedai-medicine-catalog",
      ["Name", "Form", "Ingredients", "Aliases", "Sources", "Status", "Updated"],
      filtered.map((m) => [m.name, m.form, m.ingredients.join("; "), m.aliases.join("; "), m.source_ids.join("; "), m.status, formatDate(m.updated_at)]),
    );

  return (
    <div className="space-y-5">
      <InfoNote tone={approved < MINING_THRESHOLD ? "amber" : "green"}>
        <span className="font-medium">{approved} of {MINING_THRESHOLD}</span> approved medicines needed for the "Commonly combined herbs" analysis (association rules).
        {approved < MINING_THRESHOLD ? ` Approve ${MINING_THRESHOLD - approved} more after review to enable it.` : " Enough data is available."} Draft medicines are still shown to users with a "Draft, not yet reviewed" label.
      </InfoNote>
      <Panel>
        <PanelHeader
          title="All Medicines"
          subtitle="Classical Ayurvedic formulations shown in the Herb & Medicine module."
          actions={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search name or ingredient" />
              <SecondaryButton onClick={exportCsv} icon={<Icons.Download />} disabled={!filtered.length}>Export CSV</SecondaryButton>
              <SecondaryButton onClick={() => setImportOpen(true)} icon={<Icons.Upload />}>Import</SecondaryButton>
              <PrimaryButton onClick={() => setFormTarget("new")} icon={<Icons.Plus />}>Add Medicine</PrimaryButton>
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
        <TableShell minWidth={960}>
          <thead>
            <tr className="border-b border-white/10">
              <th className={th}>Medicine</th>
              <th className={th}>Form</th>
              <th className={th}>Ingredients</th>
              <th className={th}>Status</th>
              <th className={th}>Updated</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading || !paged.pageItems.length ? (
              <EmptyRow colSpan={6} loading={loading} text={search || filter !== "all" ? "No medicines match your filters." : "No medicines in the catalog yet."} />
            ) : (
              paged.pageItems.map((medicine) => (
                <tr key={medicine.slug} className={tr}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#8FAF5A]/20 bg-[#8FAF5A]/10 text-[#A9C97C]"><Icons.Medicine /></div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#EAF2DD]">{medicine.name}</p>
                        <p className="mt-0.5 text-xs text-[#71806C]">{medicine.source_ids.length} source{medicine.source_ids.length === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                  </td>
                  <td className={td}><Badge tone="gray">{titleCase(medicine.form)}</Badge></td>
                  <td className={`${td} max-w-[320px]`}>
                    <span className="line-clamp-2" title={medicine.ingredients.join(", ")}>{medicine.ingredients.join(", ") || <span className="text-[#71806C]">Not listed</span>}</span>
                  </td>
                  <td className={td}><StatusBadge status={medicine.status} /></td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(medicine.updated_at)}</td>
                  <td className={td}>
                    <div className="flex justify-end gap-2">
                      {medicine.status === "approved" ? (
                        <IconButton label="Move to draft" tone="amber" onClick={() => void setStatus(medicine, "draft")}><Icons.X /></IconButton>
                      ) : (
                        <IconButton label="Approve" onClick={() => void setStatus(medicine, "approved")}><Icons.Check /></IconButton>
                      )}
                      <IconButton label={`Edit ${medicine.name}`} onClick={() => setFormTarget(medicine)}><Icons.Edit /></IconButton>
                      <IconButton label={`Delete ${medicine.name}`} tone="red" onClick={() => setDeleteTarget(medicine)}><Icons.Trash /></IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
        <Pagination {...paged} total={filtered.length} noun="medicines" onChange={paged.setPage} />
      </Panel>

      {formTarget && <MedicineFormModal medicine={formTarget === "new" ? null : formTarget} forms={forms} sources={sources} onClose={() => setFormTarget(null)} onSaved={() => void load()} />}
      {importOpen && <ImportCatalogModal onClose={() => setImportOpen(false)} onImported={() => void load()} />}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Medicine?"
          message={<>Delete <span className="font-medium text-[#A9C97C]">{deleteTarget.name}</span>? It will be removed from the medicine catalog and saved comparisons.</>}
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
