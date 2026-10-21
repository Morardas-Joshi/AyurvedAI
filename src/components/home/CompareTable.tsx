export interface CompareRow {
  section: string;
  label: string;
  values: unknown[];
  same: boolean;
}

export interface CompareItem {
  kind: "herb" | "medicine";
  slug: string;
  name: string;
  botanical_name?: string | null;
  family?: string | null;
  status: string;
  profile_note?: string | null;
  profile: Record<string, unknown>;
}

function textValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(textValue).filter((part) => part !== "—").join(", ") || "—";
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, textValue(entry)] as const)
      .filter(([, entry]) => entry !== "—");
    return entries.length ? entries.map(([key, entry]) => `${key}: ${entry}`).join(" · ") : "—";
  }
  if (typeof value !== "string" || !value.trim()) return "—";
  return ["unknown", "not stated", "not available"].includes(value.trim().toLocaleLowerCase()) ? "—" : value.trim();
}

export default function CompareTable({
  items,
  rows,
  onlyDifferences,
}: {
  items: CompareItem[];
  rows: CompareRow[];
  onlyDifferences: boolean;
}) {
  const visibleRows = rows.filter((row) =>
    !["Name", "Botanical name", "Family"].includes(row.label)
      && row.values.length === items.length
      && row.values.every((value) => textValue(value) !== "—")
      && (!onlyDifferences || !row.same),
  );
  const sections = Array.from(
    visibleRows.reduce((grouped, row) => {
      grouped.set(row.section, [...(grouped.get(row.section) ?? []), row]);
      return grouped;
    }, new Map<string, CompareRow[]>()),
    ([section, sectionRows]) => ({ section, rows: sectionRows }),
  );
  const columns = { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` };
  const valueFor = (label: string, itemIndex: number) => {
    const row = rows.find((entry) => entry.label === label);
    return row ? textValue(row.values[itemIndex]) : "—";
  };
  const snapshotFor = (itemIndex: number) => {
    const properties = [
      ["Rasa (taste)", valueFor("Rasa", itemIndex)],
      ["Guna (qualities)", valueFor("Guna", itemIndex)],
      ["Virya (heating or cooling potency)", valueFor("Virya", itemIndex)],
      ["Vipaka (post-digestive effect)", valueFor("Vipaka", itemIndex)],
    ].filter(([, value]) => value !== "—");
    const doshas = ["Vata", "Pitta", "Kapha"]
      .map((dosha) => [dosha, valueFor(dosha, itemIndex)] as const)
      .filter(([, value]) => value !== "—")
      .map(([dosha, value]) => value === "decreases"
        ? `${dosha} is traditionally described as reduced`
        : value === "increases"
          ? `${dosha} is traditionally described as increased`
          : `${dosha} is described as ${value}`);
    const context = [
      ["Parts used", valueFor("Parts used", itemIndex)],
      ["Traditional uses", valueFor("Classical uses", itemIndex)],
      ["Preparations", valueFor("Forms", itemIndex)],
    ].filter(([, value]) => value !== "—");
    return { properties, doshas, context };
  };
  const snapshots = items.map((_, index) => snapshotFor(index));
  const hasSnapshots = snapshots.some(({ properties, doshas, context }) => properties.length || doshas.length || context.length);

  return (
    <section aria-label="Side-by-side comparison" className="overflow-hidden rounded-3xl border border-white/10 bg-[#102117]/70">
      <div className="border-b border-white/10 px-5 py-4 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A9C97C]">Side-by-side profile</p>
        <h3 className="font-display mt-1 text-xl font-semibold text-[#EAF2DD]">Compare the recorded details</h3>
        <p className="mt-1 text-xs leading-5 text-[#9FB08F]">Each column uses information available in that item’s reference profile.</p>
      </div>

      <div className="overflow-x-auto">
      <div className="space-y-6 p-4 sm:p-6" style={{ minWidth: `${Math.max(items.length * 190, 560)}px` }}>
        <div className="grid gap-3" style={columns}>
          {items.map((item) => (
            <article key={item.slug} className="min-w-0 rounded-2xl border border-[#A9C97C]/20 bg-[#8FAF5A]/[0.07] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A9C97C]">{item.kind}</p>
              <h4 className="font-display mt-1 break-words text-lg font-semibold text-[#EAF2DD]">{item.name}</h4>
              {item.botanical_name && <p className="mt-1 break-words text-sm italic text-[#B7C4A9]">{item.botanical_name}</p>}
              {item.family && <p className="mt-2 text-xs text-[#9FB08F]">Family · {item.family}</p>}
              {item.status !== "approved" && <p className="mt-3 inline-flex rounded-full border border-[#E0B84A]/25 bg-[#E0B84A]/[0.06] px-2.5 py-1 text-[10px] text-[#D8C58D]">Profile draft</p>}
            </article>
          ))}
        </div>

        {hasSnapshots && (
          <section>
            <h4 className="mb-3 border-b border-white/10 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#A9C97C]">Ayurvedic snapshot</h4>
            <div className="grid gap-3" style={columns}>
              {items.map((item, index) => {
                const snapshot = snapshots[index];
                return (
                  <article key={`${item.slug}-snapshot`} className="min-w-0 rounded-2xl border border-[#A9C97C]/15 bg-[#8FAF5A]/[0.045] p-4">
                    <h5 className="font-display text-base font-semibold text-[#EAF2DD]">{item.name}</h5>
                    {snapshot.properties.length > 0 && (
                      <p className="mt-3 text-sm leading-6 text-[#D5DFC9]">
                        <span className="font-medium text-[#C9D8B5]">Traditional properties. </span>
                        {snapshot.properties.map(([label, value]) => `${label}: ${value}`).join("; ")}.
                      </p>
                    )}
                    {snapshot.doshas.length > 0 && (
                      <p className="mt-2 text-sm leading-6 text-[#D5DFC9]">
                        <span className="font-medium text-[#C9D8B5]">Dosha notes. </span>
                        {snapshot.doshas.join("; ")}.
                      </p>
                    )}
                    {snapshot.context.length > 0 && (
                      <p className="mt-2 text-sm leading-6 text-[#D5DFC9]">
                        <span className="font-medium text-[#C9D8B5]">Traditional context. </span>
                        {snapshot.context.map(([label, value]) => `${label}: ${value}`).join("; ")}.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {sections.map(({ section, rows: sectionRows }) => (
          <section key={section}>
            <h4 className="mb-3 border-b border-white/10 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#A9C97C]">{section}</h4>
            <div className="space-y-3">
              {sectionRows.map((row) => {
                const differs = !row.same;
                return (
                  <article key={`${row.section}-${row.label}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h5 className="text-sm font-semibold text-[#D5DFC9]">{row.label}</h5>
                      {differs && <span className="rounded-full bg-[#E0B84A]/10 px-2 py-0.5 text-[10px] font-medium text-[#E0B84A]">Different in profiles</span>}
                    </div>
                    <div className="grid gap-3" style={columns}>
                      {items.map((item, index) => {
                        const value = textValue(row.values[index]);
                        return (
                          <div key={`${item.slug}-${row.label}`} className="min-w-0 border-l border-white/10 pl-3">
                            <p className="mb-1 truncate text-[10px] font-medium uppercase tracking-wide text-[#8FA080]">{item.name}</p>
                            <p className="break-words text-sm leading-6 text-[#D5DFC9]">{value}</p>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        {visibleRows.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-[#9FB08F]">
            {onlyDifferences
              ? "No recorded differences are available. Turn off this filter to review all recorded profile details."
              : "There are no recorded profile details to compare yet."}
          </p>
        )}
      </div>
      </div>
    </section>
  );
}
