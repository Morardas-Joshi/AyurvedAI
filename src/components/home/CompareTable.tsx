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
  if (Array.isArray(value)) {
    return value.length ? value.map(textValue).filter(Boolean).join(", ") : "Not stated";
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== null && entry !== undefined && entry !== "");
    return entries.length ? entries.map(([key, entry]) => `${key}: ${textValue(entry)}`).join(" · ") : "Not stated";
  }
  return typeof value === "string" && value.trim() ? value : "Not stated";
}

export default function CompareTable({
  items,
  rows,
  onlyDifferences,
  view,
}: {
  items: CompareItem[];
  rows: CompareRow[];
  onlyDifferences: boolean;
  view: "table" | "cards";
}) {
  const visibleRows = rows.filter((row) => !onlyDifferences || !row.same);

  if (view === "cards") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item, itemIndex) => (
          <article key={item.slug} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="font-display text-xl font-semibold text-[#EAF2DD]">{item.name}</h3>
            {item.botanical_name && <p className="mt-1 text-sm italic text-[#9FB08F]">{item.botanical_name}</p>}
            <dl className="mt-4 space-y-3">
              {visibleRows.map((row) => (
                <div
                  key={`${row.section}-${row.label}`}
                  className={`border-t pt-3 ${row.same ? "border-white/5" : "border-[#E0B84A]/25"}`}
                >
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#A9C97C]">
                    {row.section} · {row.label}
                    {!row.same && <span className="ml-2 text-[#E0B84A]">Different</span>}
                  </dt>
                  <dd className={`mt-1 text-sm leading-6 ${row.values[itemIndex] == null ? "text-[#81917A]" : "text-[#D5DFC9]"}`}>
                    {textValue(row.values[itemIndex])}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    );
  }

  const rowsWithSections = visibleRows.map((row, index) => ({
    row,
    showSection: index === 0 || visibleRows.at(index - 1)?.section !== row.section,
  }));
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-white/10" tabIndex={0} aria-label="Scrollable comparison table">
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-20 bg-[#14271B]">
          <tr>
            <th scope="col" className="sticky left-0 z-30 min-w-[180px] border-b border-white/10 bg-[#14271B] px-4 py-3 text-xs uppercase tracking-wide text-[#A9C97C]">
              Comparison
            </th>
            {items.map((item) => (
              <th key={item.slug} scope="col" className="min-w-[190px] border-b border-white/10 px-4 py-3 align-top">
                <span className="block font-display text-base font-semibold text-[#EAF2DD]">{item.name}</span>
                {item.botanical_name && <span className="mt-1 block text-xs italic font-normal text-[#9FB08F]">{item.botanical_name}</span>}
                {item.status !== "approved" && <span className="mt-1 block text-[10px] font-normal text-[#E0B84A]">Draft, not yet reviewed</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowsWithSections.map(({ row, showSection }) => (
              <FragmentRow
                key={`${row.section}-${row.label}`}
                row={row}
                showSection={showSection}
                itemCount={items.length}
              />
          ))}
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={items.length + 1} className="px-4 py-6 text-center text-sm text-[#9FB08F]">
                All available rows agree. There are no differences to show.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({
  row,
  showSection,
  itemCount,
}: {
  row: CompareRow;
  showSection: boolean;
  itemCount: number;
}) {
  return (
    <>
      {showSection && (
        <tr>
          <th scope="rowgroup" colSpan={itemCount + 1} className="bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#9FB08F]">
            {row.section}
          </th>
        </tr>
      )}
      <tr className={row.same ? "bg-transparent" : "bg-[#E0B84A]/[0.06]"}>
        <th scope="row" className="sticky left-0 z-10 border-t border-white/5 bg-[#102117] px-4 py-3 font-medium text-[#B7C4A9]">
          {row.label}
          {!row.same && <span className="ml-2 text-[10px] font-semibold uppercase text-[#E0B84A]">Different</span>}
        </th>
        {row.values.map((value, index) => (
          <td
            key={`${row.label}-${index}`}
            className={`border-t border-white/5 px-4 py-3 leading-6 ${value == null || value === "" ? "text-[#81917A]" : "text-[#D5DFC9]"}`}
          >
            {textValue(value)}
          </td>
        ))}
      </tr>
    </>
  );
}
