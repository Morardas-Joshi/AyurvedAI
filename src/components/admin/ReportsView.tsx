import { useState, type ReactElement } from "react";
import { REPORT_SECTIONS, type LoginRange, type ReportSection } from "./reportConfig";
import {
  Panel,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  SelectField,
} from "./ui";
import { Icons } from "./icons";

const SECTION_ICONS: Record<ReportSection, (props: { size?: number }) => ReactElement> = {
  summary: Icons.Dashboard,
  users: Icons.Users,
  logins: Icons.History,
  knowledge: Icons.Documents,
  herbs: Icons.Leaf,
  medicines: Icons.Medicine,
  lifestyle: Icons.Sun,
  clinics: Icons.MapPin,
  safety: Icons.Shield,
  health: Icons.Pulse,
};

export default function ReportsView({ onGenerate }: { onGenerate: (sections: ReportSection[], loginRange: LoginRange) => void }) {
  const [selected, setSelected] = useState<ReportSection[]>(REPORT_SECTIONS.map((item) => item.key));
  const [loginRange, setLoginRange] = useState<LoginRange>("all");

  const toggle = (key: ReportSection) => setSelected((current) => (current.includes(key) ? current.filter((value) => value !== key) : [...current, key]));

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="Build a Report"
          subtitle="Choose the sections to include, then generate a print-ready A4 report. Use “Save as PDF” in the print dialog to download it."
          actions={
            <>
              <SecondaryButton onClick={() => setSelected(REPORT_SECTIONS.map((item) => item.key))}>Select All</SecondaryButton>
              <SecondaryButton onClick={() => setSelected([])}>Clear</SecondaryButton>
            </>
          }
        />
        <div className="grid gap-3 p-6 sm:grid-cols-2 xl:grid-cols-3">
          {REPORT_SECTIONS.map((section) => {
            const active = selected.includes(section.key);
            const Icon = SECTION_ICONS[section.key];
            return (
              <label
                key={section.key}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${active ? "border-[#8FAF5A]/45 bg-[#8FAF5A]/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}
              >
                <input type="checkbox" checked={active} onChange={() => toggle(section.key)} className="mt-1 h-4 w-4 accent-[#7CA653]" />
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${active ? "border-[#8FAF5A]/40 text-[#A9C97C]" : "border-white/10 text-[#71806C]"}`}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#EAF2DD]">{section.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#8FA080]">{section.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="flex flex-col gap-4 border-t border-white/10 p-6 md:flex-row md:items-end md:justify-between">
          <div className="w-full md:w-72">
            <SelectField
              label="Login records to include"
              value={loginRange}
              onChange={(value) => setLoginRange(value as LoginRange)}
              options={[
                { value: "all", label: "All records" },
                { value: "30", label: "Last 30 days" },
                { value: "7", label: "Last 7 days" },
              ]}
            />
          </div>
          <PrimaryButton onClick={() => onGenerate(selected, loginRange)} disabled={!selected.length} icon={<Icons.Printer />} className="md:min-w-[200px]">
            Generate Report
          </PrimaryButton>
        </div>
      </Panel>

      <Panel padded>
        <h3 className="font-admin-display text-lg text-[#EAF2DD]">What the report contains</h3>
        <ul className="mt-3 grid gap-2 text-sm text-[#A6B399] md:grid-cols-2">
          <li className="flex gap-2"><span className="text-[#A9C97C]"><Icons.Check /></span>A cover header with logo, date, time and the admin who prepared it</li>
          <li className="flex gap-2"><span className="text-[#A9C97C]"><Icons.Check /></span>Numbered sections with full tables (not just the first page)</li>
          <li className="flex gap-2"><span className="text-[#A9C97C]"><Icons.Check /></span>Summary figures, charts and automatically written key observations</li>
          <li className="flex gap-2"><span className="text-[#A9C97C]"><Icons.Check /></span>Table headers repeated on every printed page, and a sign-off line</li>
        </ul>
        <p className="mt-4 text-xs text-[#71806C]">Every module page also has an “Export CSV” button for spreadsheet use.</p>
      </Panel>
    </div>
  );
}
