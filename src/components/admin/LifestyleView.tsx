import { useMemo, useState } from "react";
import { api, downloadCsv, errorText, formatDateTime, titleCase } from "./api";
import { BarList } from "./charts";
import type { FoodRule, LifestyleData, RoutineItem, RuleStatus } from "./types";
import { td, th, tr, useAdminData, useNotify, usePaged } from "./hooks";
import {
  Badge,
  ChipToggleGroup,
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
  StatCard,
  TableShell,
  TextAreaField,
  TextField,
} from "./ui";
import { Icons } from "./icons";

type Tab = "food" | "routine" | "plans";
const DIET_TAGS = ["vegetarian", "vegan", "jain", "non-vegetarian"];
const DOSHAS = ["vata", "pitta", "kapha"];
const STATUS_OPTIONS: { value: RuleStatus; label: string }[] = [
  { value: "approved", label: "Approved" },
  { value: "draft", label: "Draft" },
  { value: "rejected", label: "Rejected" },
];

function ErrorText({ text }: { text: string }) {
  return text ? <p role="alert" className="rounded-lg border border-[#E8967A]/25 bg-[#E8967A]/10 px-3 py-2 text-sm text-[#F0B5A2] sm:col-span-2">{text}</p> : null;
}

function FoodRuleModal({ item, onClose, onSaved }: { item: FoodRule | null; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify();
  const [food, setFood] = useState(item?.food ?? "");
  const [category, setCategory] = useState<string>(item?.category ?? "favour");
  const [description, setDescription] = useState(item?.description ?? "");
  const [tags, setTags] = useState<string[]>(item?.diet_tags ?? []);
  const [caution, setCaution] = useState(item?.caution_note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!food.trim()) return setError("Food name is required.");
    if (!description.trim()) return setError("Description is required.");
    setSaving(true);
    setError("");
    try {
      const payload = { food: food.trim(), category, description: description.trim(), diet_tags: tags, caution_note: caution.trim() || null };
      const data = item
        ? await api<{ message: string }>(`/lifestyle/food-rules/${item.id}`, { method: "PUT", json: payload })
        : await api<{ message: string }>("/lifestyle/food-rules", { method: "POST", json: payload });
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
      title={item ? "Edit Food Rule" : "Add Food Rule"}
      subtitle="Food guidance shown in users' diet plans. Items you add are approved and labelled as reviewed by the admin."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={saving} icon={<Icons.Check />}>{saving ? "Saving…" : item ? "Save Changes" : "Add Food Rule"}</PrimaryButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Food" value={food} onChange={setFood} required maxLength={200} autoFocus placeholder="e.g. Seasonal fruits" />
        <SelectField label="Recommendation" value={category} onChange={setCategory} required options={[{ value: "favour", label: "Favour (recommended)" }, { value: "limit", label: "Limit (reduce)" }]} />
        <div className="sm:col-span-2">
          <TextAreaField label="Description" value={description} onChange={setDescription} required maxLength={2000} />
        </div>
        <div className="sm:col-span-2">
          <ChipToggleGroup label="Suitable for diets" options={DIET_TAGS} selected={tags} onChange={setTags} />
        </div>
        <div className="sm:col-span-2">
          <TextField label="Caution note" value={caution} onChange={setCaution} maxLength={1000} hint="Optional warning shown below the item" />
        </div>
        <ErrorText text={error} />
      </div>
    </Modal>
  );
}

function RoutineModal({ item, slots, seasons, onClose, onSaved }: { item: RoutineItem | null; slots: string[]; seasons: string[]; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify();
  const [slot, setSlot] = useState(item?.slot ?? "morning");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [doshas, setDoshas] = useState<string[]>(item?.dosha_tags ?? []);
  const [seasonTags, setSeasonTags] = useState<string[]>(item?.season_tags ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return setError("Title is required.");
    if (!description.trim()) return setError("Description is required.");
    setSaving(true);
    setError("");
    try {
      const payload = { slot, title: title.trim(), description: description.trim(), dosha_tags: doshas, season_tags: seasonTags };
      const data = item
        ? await api<{ message: string }>(`/lifestyle/routine-items/${item.id}`, { method: "PUT", json: payload })
        : await api<{ message: string }>("/lifestyle/routine-items", { method: "POST", json: payload });
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
      title={item ? "Edit Routine Item" : "Add Routine Item"}
      subtitle="Daily routine (Dinacharya) suggestions. Leave dosha and season empty to show the item to everyone."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={saving} icon={<Icons.Check />}>{saving ? "Saving…" : item ? "Save Changes" : "Add Routine Item"}</PrimaryButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Title" value={title} onChange={setTitle} required maxLength={200} autoFocus placeholder="e.g. Wake up before sunrise" />
        <SelectField label="Time of day" value={slot} onChange={setSlot} required options={slots.map((value) => ({ value, label: titleCase(value) }))} />
        <div className="sm:col-span-2">
          <TextAreaField label="Description" value={description} onChange={setDescription} required maxLength={2000} />
        </div>
        <div className="sm:col-span-2">
          <ChipToggleGroup label="Dosha (optional)" options={DOSHAS} selected={doshas} onChange={setDoshas} />
        </div>
        <div className="sm:col-span-2">
          <ChipToggleGroup label="Season (optional)" options={seasons} selected={seasonTags} onChange={setSeasonTags} />
        </div>
        <ErrorText text={error} />
      </div>
    </Modal>
  );
}

function StatusSelect({ value, onChange, label }: { value: RuleStatus; onChange: (status: RuleStatus) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as RuleStatus)}
      className="admin-select rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-[#D5DFC9] outline-none focus:border-[#8FAF5A]/60"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export default function LifestyleView() {
  const notify = useNotify();
  const [tab, setTab] = useState<Tab>("food");
  const [search, setSearch] = useState("");
  const [foodTarget, setFoodTarget] = useState<FoodRule | "new" | null>(null);
  const [routineTarget, setRoutineTarget] = useState<RoutineItem | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "food" | "routine"; id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, setData, loading, reload: load } = useAdminData<LifestyleData>("/lifestyle");

  const term = search.trim().toLowerCase();
  const foods = useMemo(() => (data?.food_rules ?? []).filter((item) => !term || `${item.food} ${item.description}`.toLowerCase().includes(term)), [data, term]);
  const routines = useMemo(() => (data?.routine_items ?? []).filter((item) => !term || `${item.title} ${item.description}`.toLowerCase().includes(term)), [data, term]);
  const foodPaged = usePaged(foods, 10, term);
  const routinePaged = usePaged(routines, 10, term);
  const plans = useMemo(() => data?.plans ?? [], [data]);
  const plansPaged = usePaged(plans, 10, plans.length);

  const seasonCounts = useMemo(() => countBy(plans.map((plan) => plan.season)), [plans]);
  const doshaCounts = useMemo(() => countBy(plans.flatMap((plan) => plan.dominant.map((d) => titleCase(d)))), [plans]);

  const setStatus = async (kind: "food" | "routine", id: number, status: RuleStatus) => {
    const path = kind === "food" ? "food-rules" : "routine-items";
    try {
      const result = await api<{ message: string }>(`/lifestyle/${path}/${id}/status`, { method: "PATCH", json: { status } });
      setData((current) =>
        current && {
          ...current,
          food_rules: kind === "food" ? current.food_rules.map((item) => (item.id === id ? { ...item, status } : item)) : current.food_rules,
          routine_items: kind === "routine" ? current.routine_items.map((item) => (item.id === id ? { ...item, status } : item)) : current.routine_items,
        },
      );
      notify("success", result.message);
    } catch (err) {
      notify("error", errorText(err));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const path = deleteTarget.kind === "food" ? "food-rules" : "routine-items";
      const result = await api<{ message: string }>(`/lifestyle/${path}/${deleteTarget.id}`, { method: "DELETE" });
      notify("success", result.message);
      setDeleteTarget(null);
      load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (tab === "food") {
      downloadCsv("ayurvedai-food-rules", ["Food", "Recommendation", "Description", "Diets", "Caution", "Status", "Source"], foods.map((f) => [f.food, f.category, f.description, f.diet_tags.join("; "), f.caution_note ?? "", f.status, f.source]));
    } else if (tab === "routine") {
      downloadCsv("ayurvedai-routine-items", ["Time of day", "Title", "Description", "Doshas", "Seasons", "Status", "Source"], routines.map((r) => [r.slot, r.title, r.description, r.dosha_tags.join("; "), r.season_tags.join("; "), r.status, r.source]));
    } else {
      downloadCsv("ayurvedai-saved-plans", ["Plan ID", "Created", "Season", "Dominant dosha"], plans.map((p) => [p.id, formatDateTime(p.created_at), p.season, p.dominant.join("; ")]));
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Food Rules" value={data?.food_rules.length ?? 0} description={data ? `${data.food_rules.filter((f) => f.status === "approved").length} approved` : ""} icon={<Icons.Leaf size={22} />} loading={loading} />
        <StatCard title="Routine Items" value={data?.routine_items.length ?? 0} description={data ? `${data.routine_items.filter((r) => r.status === "approved").length} approved` : ""} icon={<Icons.Sun size={22} />} loading={loading} />
        <StatCard title="Saved Plans" value={plans.length} description="Plans saved by users" icon={<Icons.Report size={22} />} loading={loading} />
      </div>

      <Panel>
        <PanelHeader
          title="Guideline Records"
          subtitle="Shared diet and daily-routine guidance used to build users' lifestyle plans."
          actions={
            <>
              {tab !== "plans" && <SearchInput value={search} onChange={setSearch} placeholder={tab === "food" ? "Search foods" : "Search routine"} />}
              <SecondaryButton onClick={exportCsv} icon={<Icons.Download />}>Export CSV</SecondaryButton>
              {tab === "food" && <PrimaryButton onClick={() => setFoodTarget("new")} icon={<Icons.Plus />}>Add Food Rule</PrimaryButton>}
              {tab === "routine" && <PrimaryButton onClick={() => setRoutineTarget("new")} icon={<Icons.Plus />}>Add Routine Item</PrimaryButton>}
            </>
          }
        />
        <div className="border-b border-white/10 px-6 py-3">
          <FilterTabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "food", label: "Food Rules", count: data?.food_rules.length },
              { value: "routine", label: "Daily Routine", count: data?.routine_items.length },
              { value: "plans", label: "Saved Plans", count: plans.length },
            ]}
          />
        </div>

        {tab === "food" && (
          <>
            <div className="px-6 pt-4">
              <InfoNote>Rejected items are hidden from users. Approved and draft items appear in diet plans (drafts are labelled as draft).</InfoNote>
            </div>
            <TableShell minWidth={960}>
              <thead>
                <tr className="border-b border-white/10">
                  <th className={th}>Food</th>
                  <th className={th}>Recommendation</th>
                  <th className={th}>Diets</th>
                  <th className={th}>Source</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading || !foodPaged.pageItems.length ? (
                  <EmptyRow colSpan={6} loading={loading} text={term ? "No food rules match your search." : "No food rules yet."} />
                ) : (
                  foodPaged.pageItems.map((item) => (
                    <tr key={item.id} className={tr}>
                      <td className={`${td} max-w-[340px]`}>
                        <p className="font-medium text-[#EAF2DD]">{item.food}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-[#71806C]">{item.description}</p>
                      </td>
                      <td className={td}>{item.category === "favour" ? <Badge tone="green">Favour</Badge> : <Badge tone="amber">Limit</Badge>}</td>
                      <td className={`${td} capitalize`}>{item.diet_tags.join(", ") || "—"}</td>
                      <td className={`${td} max-w-[180px] truncate`} title={item.source}>{item.source}</td>
                      <td className={td}><StatusSelect label={`Status of ${item.food}`} value={item.status} onChange={(status) => void setStatus("food", item.id, status)} /></td>
                      <td className={td}>
                        <div className="flex justify-end gap-2">
                          <IconButton label={`Edit ${item.food}`} onClick={() => setFoodTarget(item)}><Icons.Edit /></IconButton>
                          <IconButton label={`Delete ${item.food}`} tone="red" onClick={() => setDeleteTarget({ kind: "food", id: item.id, name: item.food })}><Icons.Trash /></IconButton>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
            <Pagination {...foodPaged} total={foods.length} noun="food rules" onChange={foodPaged.setPage} />
          </>
        )}

        {tab === "routine" && (
          <>
            <TableShell minWidth={960}>
              <thead>
                <tr className="border-b border-white/10">
                  <th className={th}>Time of day</th>
                  <th className={th}>Routine</th>
                  <th className={th}>Dosha</th>
                  <th className={th}>Season</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading || !routinePaged.pageItems.length ? (
                  <EmptyRow colSpan={6} loading={loading} text={term ? "No routine items match your search." : "No routine items yet."} />
                ) : (
                  routinePaged.pageItems.map((item) => (
                    <tr key={item.id} className={tr}>
                      <td className={td}><Badge tone="gray">{titleCase(item.slot)}</Badge></td>
                      <td className={`${td} max-w-[360px]`}>
                        <p className="font-medium text-[#EAF2DD]">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-[#71806C]">{item.description}</p>
                      </td>
                      <td className={`${td} capitalize`}>{item.dosha_tags.join(", ") || "All"}</td>
                      <td className={td}>{item.season_tags.join(", ") || "All"}</td>
                      <td className={td}><StatusSelect label={`Status of ${item.title}`} value={item.status} onChange={(status) => void setStatus("routine", item.id, status)} /></td>
                      <td className={td}>
                        <div className="flex justify-end gap-2">
                          <IconButton label={`Edit ${item.title}`} onClick={() => setRoutineTarget(item)}><Icons.Edit /></IconButton>
                          <IconButton label={`Delete ${item.title}`} tone="red" onClick={() => setDeleteTarget({ kind: "routine", id: item.id, name: item.title })}><Icons.Trash /></IconButton>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
            <Pagination {...routinePaged} total={routines.length} noun="routine items" onChange={routinePaged.setPage} />
          </>
        )}

        {tab === "plans" && (
          <div>
            <div className="grid gap-6 border-b border-white/10 p-6 md:grid-cols-2">
              <div>
                <p className="mb-3 text-xs uppercase tracking-wider text-[#71806C]">Plans by season</p>
                <BarList items={seasonCounts} emptyText="No saved plans yet." />
              </div>
              <div>
                <p className="mb-3 text-xs uppercase tracking-wider text-[#71806C]">Dominant dosha (Prakriti)</p>
                <BarList items={doshaCounts} emptyText="No saved plans yet." />
              </div>
            </div>
            <TableShell minWidth={640}>
              <thead>
                <tr className="border-b border-white/10">
                  <th className={th}>Plan</th>
                  <th className={th}>Created</th>
                  <th className={th}>Season</th>
                  <th className={th}>Dominant dosha</th>
                </tr>
              </thead>
              <tbody>
                {loading || !plansPaged.pageItems.length ? (
                  <EmptyRow colSpan={4} loading={loading} text="No saved plans yet." />
                ) : (
                  plansPaged.pageItems.map((plan) => (
                    <tr key={plan.id} className={tr}>
                      <td className={td}>Plan #{plan.id}</td>
                      <td className={td}>{formatDateTime(plan.created_at)}</td>
                      <td className={td}>{plan.season}</td>
                      <td className={`${td} capitalize`}>{plan.dominant.join(", ") || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
            <Pagination {...plansPaged} total={plans.length} noun="plans" onChange={plansPaged.setPage} />
            <p className="px-6 pb-5 text-xs text-[#71806C]">For privacy, plans are stored against an anonymous user hash, so names are not shown.</p>
          </div>
        )}
      </Panel>

      {foodTarget && <FoodRuleModal item={foodTarget === "new" ? null : foodTarget} onClose={() => setFoodTarget(null)} onSaved={() => void load()} />}
      {routineTarget && data && <RoutineModal item={routineTarget === "new" ? null : routineTarget} slots={data.slots} seasons={data.seasons} onClose={() => setRoutineTarget(null)} onSaved={() => void load()} />}
      {deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.kind === "food" ? "Delete Food Rule?" : "Delete Routine Item?"}
          message={<>Delete <span className="font-medium text-[#A9C97C]">{deleteTarget.name}</span>? It will no longer appear in users' lifestyle plans. To hide it temporarily, set its status to Rejected instead.</>}
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

