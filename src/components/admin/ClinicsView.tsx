import { useMemo, useState } from "react";
import { API_BASE, api, downloadCsv, errorText, formatDate, titleCase } from "./api";
import type { Clinic } from "./types";
import { td, th, tr, useAdminData, useNotify, usePaged } from "./hooks";
import {
  Badge,
  ConfirmDialog,
  EmptyRow,
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
  TableShell,
  TextField,
} from "./ui";
import { Icons } from "./icons";

type GeoResult = { label: string; lat: number; lng: number };
const KIND_LABELS: Record<string, string> = { hospital: "Hospital", clinic: "Clinic", doctor: "Doctor", pharmacy: "Pharmacy" };

function ClinicFormModal({ clinic, kinds, onClose, onSaved }: { clinic: Clinic | null; kinds: string[]; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify();
  const [form, setForm] = useState({
    name: clinic?.name ?? "",
    kind: clinic?.kind ?? "clinic",
    speciality: clinic?.speciality ?? "",
    address: clinic?.address ?? "",
    city: clinic?.city ?? "",
    state: clinic?.state ?? "",
    phone: clinic?.phone ?? "",
    website: clinic?.website ?? "",
    timings: clinic?.timings ?? "",
    lat: clinic ? String(clinic.lat) : "",
    lng: clinic ? String(clinic.lng) : "",
  });
  const [results, setResults] = useState<GeoResult[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const findCoordinates = async () => {
    const query = [form.address, form.city, form.state].filter((part) => part.trim()).join(", ") || form.name;
    if (query.trim().length < 3) return setError("Enter an address or city first.");
    setGeoBusy(true);
    setError("");
    try {
      const data = await api<{ results: GeoResult[] }>(`${API_BASE}/api/locator/geocode?q=${encodeURIComponent(query.trim().slice(0, 120))}`);
      setResults(data.results.slice(0, 5));
      if (!data.results.length) setError("No location found. Try a simpler address or enter coordinates manually.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setGeoBusy(false);
    }
  };

  const save = async () => {
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (form.name.trim().length < 2) return setError("Name must be at least 2 characters.");
    if (form.lat.trim() === "" || Number.isNaN(lat) || lat < -90 || lat > 90) return setError("Latitude must be a number between -90 and 90.");
    if (form.lng.trim() === "" || Number.isNaN(lng) || lng < -180 || lng > 180) return setError("Longitude must be a number between -180 and 180.");
    if (form.website.trim() && !/^https?:\/\//i.test(form.website.trim())) return setError("Website must start with http:// or https://");
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, name: form.name.trim(), lat, lng };
      const data = clinic
        ? await api<{ message: string }>(`/clinics/${clinic.id}`, { method: "PUT", json: payload })
        : await api<{ message: string }>("/clinics", { method: "POST", json: payload });
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
      title={clinic ? "Edit Verified Clinic" : "Add Verified Clinic"}
      subtitle="Verified places appear first in the Healthcare Locator with a Verified badge."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={saving} icon={<Icons.Check />}>{saving ? "Saving…" : clinic ? "Save Changes" : "Add Clinic"}</PrimaryButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" value={form.name} onChange={set("name")} required maxLength={200} autoFocus placeholder="e.g. Shree Ayurveda Clinic" />
        <SelectField label="Type" value={form.kind} onChange={set("kind")} required options={kinds.map((value) => ({ value, label: KIND_LABELS[value] ?? titleCase(value) }))} />
        <TextField label="Speciality" value={form.speciality} onChange={set("speciality")} maxLength={200} placeholder="e.g. Panchakarma" />
        <TextField label="Phone" value={form.phone} onChange={set("phone")} maxLength={60} type="tel" />
        <div className="sm:col-span-2">
          <TextField label="Address" value={form.address} onChange={set("address")} maxLength={500} />
        </div>
        <TextField label="City" value={form.city} onChange={set("city")} maxLength={100} />
        <TextField label="State" value={form.state} onChange={set("state")} maxLength={100} />
        <TextField label="Website" value={form.website} onChange={set("website")} maxLength={300} placeholder="https://" />
        <TextField label="Timings" value={form.timings} onChange={set("timings")} maxLength={200} placeholder="e.g. Mon–Sat 9:00–18:00" />
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wider text-[#8FA080]">Map location<span className="ml-0.5 text-[#E8967A]">*</span></p>
            <SecondaryButton onClick={() => void findCoordinates()} disabled={geoBusy} icon={<Icons.MapPin size={16} />}>{geoBusy ? "Searching…" : "Find from address"}</SecondaryButton>
          </div>
          {results.length > 0 && (
            <ul className="mb-3 space-y-1">
              {results.map((result) => (
                <li key={`${result.lat}-${result.lng}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((current) => ({ ...current, lat: result.lat.toFixed(6), lng: result.lng.toFixed(6) }));
                      setResults([]);
                    }}
                    className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-[#B7C4A9] hover:border-[#8FAF5A]/40 hover:bg-[#8FAF5A]/10"
                  >
                    {result.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Latitude" value={form.lat} onChange={set("lat")} required type="number" step="any" placeholder="23.0225" />
            <TextField label="Longitude" value={form.lng} onChange={set("lng")} required type="number" step="any" placeholder="72.5714" />
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg border border-[#E8967A]/25 bg-[#E8967A]/10 px-3 py-2 text-sm text-[#F0B5A2] sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  );
}

export default function ClinicsView() {
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [formTarget, setFormTarget] = useState<Clinic | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Clinic | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, setData, loading, reload: load } = useAdminData<{ clinics: Clinic[]; kinds: string[] }>("/clinics");
  const clinics = useMemo(() => data?.clinics ?? [], [data]);
  const setClinics = (update: (current: Clinic[]) => Clinic[]) => setData((current) => current && { ...current, clinics: update(current.clinics) });
  const kinds = data?.kinds ?? ["hospital", "clinic", "doctor", "pharmacy"];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? clinics.filter((c) => [c.name, c.city, c.state, c.speciality, c.kind].some((value) => value.toLowerCase().includes(term))) : clinics;
  }, [clinics, search]);
  const paged = usePaged(filtered, 10, search);

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const data = await api<{ message: string }>(`/clinics/${deleteTarget.id}`, { method: "DELETE" });
      setClinics((current) => current.filter((item) => item.id !== deleteTarget.id));
      notify("success", data.message);
      setDeleteTarget(null);
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <InfoNote>Verified clinics are shown first in the user's Healthcare Locator with a "Verified" badge, and replace any matching OpenStreetMap result within 150 m.</InfoNote>
      <Panel>
        <PanelHeader
          title="All Verified Places"
          subtitle="Ayurvedic hospitals, clinics, doctors and pharmacies checked by the admin."
          actions={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search name or city" />
              <SecondaryButton
                icon={<Icons.Download />}
                disabled={!filtered.length}
                onClick={() =>
                  downloadCsv(
                    "ayurvedai-verified-clinics",
                    ["Name", "Type", "Speciality", "Address", "City", "State", "Phone", "Website", "Timings", "Latitude", "Longitude", "Added"],
                    filtered.map((c) => [c.name, c.kind, c.speciality, c.address, c.city, c.state, c.phone, c.website, c.timings, c.lat, c.lng, formatDate(c.created_at)]),
                  )
                }
              >
                Export CSV
              </SecondaryButton>
              <PrimaryButton onClick={() => setFormTarget("new")} icon={<Icons.Plus />}>Add Clinic</PrimaryButton>
            </>
          }
        />
        <TableShell minWidth={960}>
          <thead>
            <tr className="border-b border-white/10">
              <th className={th}>Name</th>
              <th className={th}>Type</th>
              <th className={th}>Location</th>
              <th className={th}>Contact</th>
              <th className={th}>Coordinates</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading || !paged.pageItems.length ? (
              <EmptyRow colSpan={6} loading={loading} text={search ? "No clinics match your search." : "No verified clinics yet. Click \"Add Clinic\" to add the first one."} />
            ) : (
              paged.pageItems.map((clinic) => (
                <tr key={clinic.id} className={tr}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#8FAF5A]/20 bg-[#8FAF5A]/10 text-[#A9C97C]"><Icons.MapPin /></div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#EAF2DD]">{clinic.name}</p>
                        <p className="mt-0.5 text-xs text-[#71806C]">{clinic.speciality || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className={td}><Badge tone="gray">{KIND_LABELS[clinic.kind] ?? titleCase(clinic.kind)}</Badge></td>
                  <td className={`${td} max-w-[240px]`}>
                    <p>{[clinic.city, clinic.state].filter(Boolean).join(", ") || "—"}</p>
                    {clinic.address && <p className="mt-0.5 truncate text-xs text-[#71806C]" title={clinic.address}>{clinic.address}</p>}
                  </td>
                  <td className={td}>
                    <p>{clinic.phone || "—"}</p>
                    {clinic.website && (
                      <a href={clinic.website} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#A9C97C] hover:underline">
                        <Icons.Globe size={12} /> Website
                      </a>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap text-xs`}>
                    <a href={`https://www.openstreetmap.org/?mlat=${clinic.lat}&mlon=${clinic.lng}#map=17/${clinic.lat}/${clinic.lng}`} target="_blank" rel="noreferrer" className="text-[#A9C97C] hover:underline">
                      {clinic.lat.toFixed(4)}, {clinic.lng.toFixed(4)}
                    </a>
                  </td>
                  <td className={td}>
                    <div className="flex justify-end gap-2">
                      <IconButton label={`Edit ${clinic.name}`} onClick={() => setFormTarget(clinic)}><Icons.Edit /></IconButton>
                      <IconButton label={`Delete ${clinic.name}`} tone="red" onClick={() => setDeleteTarget(clinic)}><Icons.Trash /></IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
        <Pagination {...paged} total={filtered.length} noun="clinics" onChange={paged.setPage} />
      </Panel>

      {formTarget && <ClinicFormModal clinic={formTarget === "new" ? null : formTarget} kinds={kinds} onClose={() => setFormTarget(null)} onSaved={() => void load()} />}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Clinic?"
          message={<>Delete <span className="font-medium text-[#A9C97C]">{deleteTarget.name}</span>? It will no longer appear as a verified place in the Healthcare Locator.</>}
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
