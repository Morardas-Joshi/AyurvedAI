import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import logo from "../../assets/ayurvedAI_logo.png";
import { api, describeDevice, errorText, formatDate, formatDateTime, formatFileSize, percent, titleCase } from "./api";
import { BarList, ColumnChart, DailyLoginChart } from "./charts";
import { chartColors } from "./palette";
import type {
  Clinic,
  DocumentItem,
  HealthReport,
  Herb,
  LifestyleData,
  LoggedInAdmin,
  LoginRecord,
  Medicine,
  SafetyEvent,
  SafetyRulesInfo,
  Summary,
  User,
} from "./types";
import { REPORT_SECTIONS, type LoginRange, type ReportSection } from "./reportConfig";
import { Icons } from "./icons";

type ReportData = {
  summary: Summary;
  users?: User[];
  logins?: LoginRecord[];
  documents?: DocumentItem[];
  herbs?: Herb[];
  medicines?: Medicine[];
  lifestyle?: LifestyleData;
  clinics?: Clinic[];
  safety?: { events: SafetyEvent[]; rules: SafetyRulesInfo };
  health?: HealthReport;
};

async function loadReportData(sections: ReportSection[]): Promise<ReportData> {
  const has = (key: ReportSection) => sections.includes(key);
  const [summary, users, logins, documents, herbs, medicines, lifestyle, clinics, safety, health] = await Promise.all([
    api<Summary>("/summary"),
    has("users") ? api<{ users: User[] }>("/users").then((d) => d.users) : undefined,
    has("logins") ? api<{ history: LoginRecord[] }>("/login-history").then((d) => d.history) : undefined,
    has("knowledge") ? api<{ documents: DocumentItem[] }>("/documents").then((d) => d.documents) : undefined,
    has("herbs") ? api<{ herbs: Herb[] }>("/herbs").then((d) => d.herbs) : undefined,
    has("medicines") ? api<{ medicines: Medicine[] }>("/medicines").then((d) => d.medicines) : undefined,
    has("lifestyle") ? api<LifestyleData>("/lifestyle") : undefined,
    has("clinics") ? api<{ clinics: Clinic[] }>("/clinics").then((d) => d.clinics) : undefined,
    has("safety") ? api<{ events: SafetyEvent[]; rules: SafetyRulesInfo }>("/safety/events") : undefined,
    has("health") ? api<HealthReport>("/health") : undefined,
  ]);
  return { summary, users, logins, documents, herbs, medicines, lifestyle, clinics, safety, health };
}

// ------------------------------------------------------------------ small print building blocks

function Section({ number, title, intro, children, breakBefore }: { number: number; title: string; intro?: string; children: ReactNode; breakBefore?: boolean }) {
  return (
    <section className={`rpt-section ${breakBefore ? "rpt-break" : ""}`}>
      <h2>
        <span className="rpt-num">{number}.</span> {title}
      </h2>
      {intro && <p className="rpt-intro">{intro}</p>}
      {children}
    </section>
  );
}

function Kpis({ items }: { items: { label: string; value: ReactNode; note?: string }[] }) {
  return (
    <div className="rpt-kpis">
      {items.map((item) => (
        <div key={item.label} className="rpt-kpi">
          <p className="rpt-kpi-label">{item.label}</p>
          <p className="rpt-kpi-value">{item.value}</p>
          {item.note && <p className="rpt-kpi-note">{item.note}</p>}
        </div>
      ))}
    </div>
  );
}

function Table({ headers, rows, empty, numbered = true, align }: { headers: string[]; rows: ReactNode[][]; empty: string; numbered?: boolean; align?: ("left" | "right" | "center")[] }) {
  if (!rows.length) return <p className="rpt-empty">{empty}</p>;
  return (
    <table className="rpt-table">
      <thead>
        <tr>
          {numbered && <th className="rpt-idx">#</th>}
          {headers.map((header, index) => (
            <th key={header} style={{ textAlign: align?.[index] ?? "left" }}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {numbered && <td className="rpt-idx">{rowIndex + 1}</td>}
            {row.map((cell, index) => (
              <td key={index} style={{ textAlign: align?.[index] ?? "left" }}>{cell ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  return <span className={`rpt-pill rpt-pill-${tone}`}>{children}</span>;
}

function statusPill(status: string) {
  if (status === "approved" || status === "active" || status === "success" || status === "ok") return <Pill tone="good">✓ {status === "ok" ? "Operational" : titleCase(status)}</Pill>;
  if (status === "rejected" || status === "inactive" || status === "failed" || status === "error") return <Pill tone="bad">✕ {status === "error" ? "Not working" : titleCase(status)}</Pill>;
  if (status === "warning") return <Pill tone="warn">! Needs attention</Pill>;
  return <Pill tone="neutral">{titleCase(status)}</Pill>;
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="rpt-sub">{children}</h3>;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

// ------------------------------------------------------------------ the report

function ReportBody({ data, sections, loginRange, admin }: { data: ReportData; sections: ReportSection[]; loginRange: LoginRange; admin: LoggedInAdmin | null }) {
  const s = data.summary;
  const generated = new Date(s.generated_at);
  let counter = 0;
  const next = () => ++counter;

  const logins = (data.logins ?? []).filter((item) => loginRange === "all" || new Date(item.login_at).getTime() >= generated.getTime() - Number(loginRange) * 86400000);
  const rangeText = loginRange === "all" ? "all recorded attempts" : `the last ${loginRange} days`;
  const healthOk = data.health ? data.health.checks.filter((c) => c.status === "ok").length : null;
  const topReason = s.logins.failure_reasons[0];

  const observations = [
    `${s.users.total} registered user account${s.users.total === 1 ? "" : "s"}: ${s.users.active} active (${percent(s.users.active, s.users.total)}) and ${s.users.inactive} inactive.`,
    `${s.logins.total} login attempts recorded with a ${percent(s.logins.success, s.logins.total)} success rate${topReason ? `; the most common failure reason is "${topReason.reason}" (${topReason.count}).` : "."}`,
    `The AI knowledge base contains ${s.knowledge_base.files} document${s.knowledge_base.files === 1 ? "" : "s"} split into ${s.knowledge_base.chunks} searchable chunks.`,
    `Catalog review: ${s.herbs.approved} of ${s.herbs.total} herbs and ${s.medicines.approved} of ${s.medicines.total} medicines are approved; the rest are shown to users as drafts.`,
    s.medicines.approved < 20
      ? `Herb-combination analysis (association rules) needs at least 20 approved medicines; ${20 - s.medicines.approved} more approval${20 - s.medicines.approved === 1 ? " is" : "s are"} required.`
      : "Enough approved medicines are available for herb-combination analysis.",
    `${s.safety.total} safety alert${s.safety.total === 1 ? "" : "s"} recorded (${s.safety.last_7_days} in the last 7 days).`,
    ...(healthOk !== null && data.health ? [`System health: ${healthOk} of ${data.health.checks.length} service checks are operational.`] : []),
  ];

  return (
    <div className="rpt">
      {/* ---------- cover / header ---------- */}
      <header className="rpt-header">
        <div className="rpt-brand">
          <img src={logo} alt="" />
          <div>
            <p className="rpt-brand-name">AyurvedAI</p>
            <p className="rpt-brand-tag">AI-powered Ayurvedic knowledge assistant</p>
          </div>
        </div>
        <div className="rpt-meta">
          <p className="rpt-doc-type">Administration Report</p>
          <p>Generated: {formatDateTime(generated.toISOString())}</p>
          <p>Prepared by: {admin?.name ?? "Administrator"}{admin?.email ? ` (${admin.email})` : ""}</p>
        </div>
      </header>
      <div className="rpt-title-block">
        <h1>Platform Administration Report</h1>
        <p>
          This report summarises users, authentication activity, knowledge-base content, catalog review status, safety monitoring and system health of the AyurvedAI platform as of {formatDate(generated.toISOString())}.
        </p>
        <p className="rpt-contents">
          <span>Contents:</span> {sections.map((key) => REPORT_SECTIONS.find((item) => item.key === key)?.title).join(" · ")}
        </p>
      </div>

      {sections.includes("summary") && (
        <Section number={next()} title="Executive Summary">
          <Kpis
            items={[
              { label: "Total users", value: s.users.total, note: `${s.users.active} active · ${s.users.inactive} inactive` },
              { label: "Login attempts", value: s.logins.total, note: `${percent(s.logins.success, s.logins.total)} successful` },
              { label: "Failed logins", value: s.logins.failed, note: `${s.logins.failed_today} today` },
              { label: "Knowledge base", value: s.knowledge_base.files, note: `${s.knowledge_base.chunks} indexed chunks` },
              { label: "Herbs", value: s.herbs.total, note: `${s.herbs.approved} approved` },
              { label: "Medicines", value: s.medicines.total, note: `${s.medicines.approved} approved` },
              { label: "Saved lifestyle plans", value: s.lifestyle_plans.total },
              { label: "Safety alerts", value: s.safety.total, note: `${s.safety.last_7_days} in last 7 days` },
            ]}
          />
          <SubHeading>Key observations</SubHeading>
          <ul className="rpt-list">
            {observations.map((text) => <li key={text}>{text}</li>)}
          </ul>
          <div className="rpt-grid-2">
            <div className="rpt-figure">
              <p className="rpt-figure-title">Figure: Login attempts per day (last 30 days)</p>
              <DailyLoginChart data={s.logins.per_day} theme="print" height={190} />
            </div>
            <div className="rpt-figure">
              <p className="rpt-figure-title">Figure: New registrations per month</p>
              <ColumnChart theme="print" height={190} label="Registrations per month" data={s.registrations_per_month.map((item) => ({ label: monthLabel(item.month), count: item.count }))} />
            </div>
          </div>
        </Section>
      )}

      {sections.includes("users") && data.users && (
        <Section number={next()} title="User Report" intro={`${data.users.length} registered accounts — ${s.users.active} active and ${s.users.inactive} inactive.`} breakBefore>
          <Table
            headers={["Name", "Email", "Status", "Joined", "Last login"]}
            rows={data.users.map((user) => [user.name, user.email, statusPill(user.status), formatDate(user.created_at), user.last_login ? formatDateTime(user.last_login) : "Never"])}
            empty="No users are registered."
          />
        </Section>
      )}

      {sections.includes("logins") && data.logins && (
        <Section number={next()} title="Login Activity" intro={`Authentication attempts for ${rangeText}. Administrator sign-ins are included and shown without a user ID.`} breakBefore>
          <Kpis
            items={[
              { label: "Attempts in report", value: logins.length },
              { label: "Successful", value: logins.filter((l) => l.status === "success").length },
              { label: "Failed", value: logins.filter((l) => l.status !== "success").length },
              { label: "Success rate", value: percent(logins.filter((l) => l.status === "success").length, logins.length) },
            ]}
          />
          <div className="rpt-grid-2">
            <div className="rpt-figure">
              <p className="rpt-figure-title">Failure reasons (all time)</p>
              <BarList theme="print" color={chartColors.print.secondary} items={s.logins.failure_reasons.map((r) => ({ label: r.reason, count: r.count }))} emptyText="No failed logins." />
            </div>
            <div className="rpt-figure">
              <p className="rpt-figure-title">Devices used (attempts in report)</p>
              <BarList
                theme="print"
                items={Object.entries(
                  logins.reduce<Record<string, number>>((acc, item) => {
                    const device = describeDevice(item.user_agent);
                    acc[device] = (acc[device] ?? 0) + 1;
                    return acc;
                  }, {}),
                )
                  .map(([label, count]) => ({ label, count }))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 6)}
                emptyText="No login attempts."
              />
            </div>
          </div>
          <SubHeading>Login records</SubHeading>
          <Table
            headers={["Date & time", "Email", "IP address", "Device", "Status", "Details"]}
            rows={logins.map((item) => [formatDateTime(item.login_at), item.email, item.ip_address ?? "—", describeDevice(item.user_agent), statusPill(item.status), item.status === "success" ? "Authenticated" : item.failure_reason ?? "Login failed"])}
            empty="No login attempts in this period."
          />
        </Section>
      )}

      {sections.includes("knowledge") && data.documents && (
        <Section number={next()} title="Knowledge Base" intro={`${data.documents.length} documents (${formatFileSize(data.documents.reduce((sum, d) => sum + d.size, 0))}) are indexed into ${s.knowledge_base.chunks} chunks that the AI assistant searches before answering.`} breakBefore>
          <Table
            headers={["File name", "Type", "Size", "Indexed chunks", "Added"]}
            align={["left", "left", "right", "right", "left"]}
            rows={data.documents.map((doc) => [doc.filename, doc.extension.replace(".", "").toUpperCase(), formatFileSize(doc.size), doc.chunks ?? "Not indexed", formatDate(doc.uploaded_at)])}
            empty="No documents uploaded."
          />
        </Section>
      )}

      {sections.includes("herbs") && data.herbs && (
        <Section number={next()} title="Herb Catalog" intro={`${data.herbs.length} herbs — ${data.herbs.filter((h) => h.status === "approved").length} approved, ${data.herbs.filter((h) => h.status !== "approved").length} draft, ${data.herbs.filter((h) => h.toxic).length} marked toxic.`} breakBefore>
          <Table
            headers={["English name", "Sanskrit name", "Botanical name", "Family", "Toxic", "Status"]}
            rows={data.herbs.map((herb) => [herb.name_english ?? herb.slug, herb.name_sanskrit ?? "—", herb.botanical_name ? <em>{herb.botanical_name}</em> : "—", herb.family ?? "—", herb.toxic ? <Pill tone="bad">Yes</Pill> : "No", statusPill(herb.status)])}
            empty="No herbs in the catalog."
          />
        </Section>
      )}

      {sections.includes("medicines") && data.medicines && (
        <Section number={next()} title="Medicine Catalog" intro={`${data.medicines.length} classical formulations — ${data.medicines.filter((m) => m.status === "approved").length} approved.`} breakBefore={!sections.includes("herbs")}>
          <Table
            headers={["Medicine", "Form", "Ingredients", "Status"]}
            rows={data.medicines.map((m) => [m.name, titleCase(m.form), m.ingredients.join(", ") || "Not listed", statusPill(m.status)])}
            empty="No medicines in the catalog."
          />
        </Section>
      )}

      {sections.includes("lifestyle") && data.lifestyle && (
        <Section number={next()} title="Lifestyle Guidelines" intro="Shared diet and daily-routine guidance used to build personalised lifestyle plans." breakBefore>
          <Kpis
            items={[
              { label: "Food rules", value: data.lifestyle.food_rules.length, note: `${data.lifestyle.food_rules.filter((f) => f.status === "approved").length} approved` },
              { label: "Routine items", value: data.lifestyle.routine_items.length, note: `${data.lifestyle.routine_items.filter((r) => r.status === "approved").length} approved` },
              { label: "Saved plans", value: data.lifestyle.plans.length },
            ]}
          />
          <div className="rpt-grid-2">
            <div className="rpt-figure">
              <p className="rpt-figure-title">Saved plans by season</p>
              <BarList theme="print" items={s.lifestyle_plans.by_season} emptyText="No saved plans." />
            </div>
            <div className="rpt-figure">
              <p className="rpt-figure-title">Dominant dosha in saved plans</p>
              <BarList theme="print" items={s.lifestyle_plans.by_dosha} emptyText="No saved plans." />
            </div>
          </div>
          <SubHeading>Food rules</SubHeading>
          <Table headers={["Food", "Recommendation", "Diets", "Source", "Status"]} rows={data.lifestyle.food_rules.map((f) => [f.food, f.category === "favour" ? "Favour" : "Limit", f.diet_tags.map(titleCase).join(", ") || "—", f.source, statusPill(f.status)])} empty="No food rules." />
          <SubHeading>Daily routine</SubHeading>
          <Table headers={["Time of day", "Routine", "Dosha", "Season", "Status"]} rows={data.lifestyle.routine_items.map((r) => [titleCase(r.slot), r.title, r.dosha_tags.map(titleCase).join(", ") || "All", r.season_tags.join(", ") || "All", statusPill(r.status)])} empty="No routine items." />
        </Section>
      )}

      {sections.includes("clinics") && data.clinics && (
        <Section number={next()} title="Verified Clinics" intro={`${data.clinics.length} admin-verified place${data.clinics.length === 1 ? "" : "s"} shown first in the Healthcare Locator.`}>
          <Table headers={["Name", "Type", "City / State", "Phone", "Speciality"]} rows={data.clinics.map((c) => [c.name, titleCase(c.kind), [c.city, c.state].filter(Boolean).join(", ") || "—", c.phone || "—", c.speciality || "—"])} empty="No verified clinics have been added yet." />
        </Section>
      )}

      {sections.includes("safety") && data.safety && (
        <Section number={next()} title="Safety Monitoring" intro="Risky requests detected by the safety filter (emergencies, pregnancy, dosage questions and similar). Message text is never stored; users are identified only by an anonymous reference." breakBefore>
          <Kpis
            items={[
              { label: "Total alerts", value: data.safety.events.length },
              { label: "Last 7 days", value: s.safety.last_7_days },
              { label: "Emergencies", value: data.safety.events.filter((e) => e.level === "emergency" || e.level === "critical").length },
              { label: "Rules version", value: data.safety.rules.version ?? "—" },
            ]}
          />
          <div className="rpt-grid-2">
            <div className="rpt-figure">
              <p className="rpt-figure-title">Alerts by level</p>
              <BarList theme="print" items={s.safety.by_level} emptyText="No alerts." />
            </div>
            <div className="rpt-figure">
              <p className="rpt-figure-title">Active safety rules</p>
              <table className="rpt-kv">
                <tbody>
                  <tr><td>Emergency patterns</td><td>{data.safety.rules.emergency_patterns ?? "—"}</td></tr>
                  <tr><td>Unsafe-request patterns</td><td>{data.safety.rules.unsafe_patterns ?? "—"}</td></tr>
                  <tr><td>Special groups</td><td>{data.safety.rules.special_groups?.map(titleCase).join(", ") || "—"}</td></tr>
                  {Object.entries(data.safety.rules.phone_numbers ?? {}).map(([key, value]) => (
                    <tr key={key}><td>Helpline: {titleCase(key)}</td><td>{value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <SubHeading>Safety event log</SubHeading>
          <Table headers={["Date & time", "Module", "Level", "Flags", "User ref."]} rows={data.safety.events.map((e) => [formatDateTime(e.created_at), titleCase(e.context), e.level === "emergency" ? <Pill tone="bad">Emergency</Pill> : e.level === "warning" ? <Pill tone="warn">Warning</Pill> : titleCase(e.level), e.flags.map(titleCase).join(", ") || "—", e.user_hash ?? "guest"])} empty="No safety events recorded." />
        </Section>
      )}

      {sections.includes("health") && data.health && (
        <Section number={next()} title="System Health" intro={`Checked on ${formatDateTime(data.health.checked_at)}.`}>
          <Table headers={["Service", "Status", "Details"]} rows={data.health.checks.map((c) => [c.name, statusPill(c.status), c.detail])} empty="No checks available." />
        </Section>
      )}

      <section className="rpt-signoff">
        <div>
          <p className="rpt-sign-line" />
          <p>Prepared by: {admin?.name ?? "Administrator"}</p>
        </div>
        <div>
          <p className="rpt-sign-line" />
          <p>Date: {formatDate(generated.toISOString())}</p>
        </div>
      </section>
      <footer className="rpt-footer">AyurvedAI · Administration Report · Generated {formatDateTime(generated.toISOString())} · For internal administrative use only</footer>
    </div>
  );
}

const REPORT_CSS = `
.report-overlay { position: fixed; inset: 0; z-index: 80; overflow-y: auto; background: #1d2a20; }
.report-toolbar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; padding: 12px 20px; background: rgba(13,31,20,0.96); border-bottom: 1px solid rgba(255,255,255,0.1); }
.report-page { width: 210mm; max-width: calc(100vw - 24px); margin: 24px auto 48px; background: #fff; color: #1c2418; padding: 16mm 14mm; box-shadow: 0 30px 80px -20px rgba(0,0,0,0.6); border-radius: 4px; }
.rpt { font-family: Inter, system-ui, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1c2418; }
.rpt h1, .rpt h2, .rpt h3 { font-family: Fraunces, Georgia, serif; color: #1f3a17; margin: 0; }
.rpt-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 12px; border-bottom: 3px solid #4E8A2E; }
.rpt-brand { display: flex; align-items: center; gap: 10px; }
.rpt-brand img { width: 46px; height: 46px; object-fit: contain; }
.rpt-brand-name { font-family: Fraunces, Georgia, serif; font-size: 18pt; font-weight: 600; color: #1f3a17; margin: 0; line-height: 1.1; }
.rpt-brand-tag { font-size: 8.5pt; color: #5b6656; margin: 2px 0 0; }
.rpt-meta { text-align: right; font-size: 8.5pt; color: #4a5446; }
.rpt-meta p { margin: 0 0 2px; }
.rpt-doc-type { font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: #4E8A2E !important; font-size: 8pt; }
.rpt-title-block { margin: 18px 0 8px; }
.rpt-title-block h1 { font-size: 20pt; font-weight: 600; }
.rpt-title-block p { margin: 6px 0 0; color: #4a5446; }
.rpt-contents { font-size: 8.5pt; }
.rpt-contents span { font-weight: 600; color: #1f3a17; }
.rpt-section { margin-top: 22px; }
.rpt-section h2 { font-size: 14pt; font-weight: 600; padding-bottom: 5px; border-bottom: 1px solid #d9dfd3; margin-bottom: 8px; break-after: avoid; }
.rpt-num { color: #4E8A2E; }
.rpt-intro { margin: 0 0 10px; color: #4a5446; }
.rpt-sub { font-size: 11pt; font-weight: 600; margin: 14px 0 6px !important; break-after: avoid; }
.rpt-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 4px; }
.rpt-kpi { border: 1px solid #dfe5d9; border-radius: 6px; padding: 8px 10px; background: #f6f8f3; break-inside: avoid; }
.rpt-kpi-label { margin: 0; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: #5b6656; }
.rpt-kpi-value { margin: 2px 0 0; font-family: Fraunces, Georgia, serif; font-size: 16pt; font-weight: 600; color: #1c2418; }
.rpt-kpi-note { margin: 0; font-size: 7.5pt; color: #6b7466; }
.rpt-list { margin: 4px 0 8px; padding-left: 18px; list-style: disc; }
.rpt-list li { margin: 3px 0; }
.rpt-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 10px 0 4px; }
.rpt-figure { border: 1px solid #e5e9e1; border-radius: 6px; padding: 10px 12px; break-inside: avoid; overflow: hidden; }
.rpt-figure-title { margin: 0 0 8px; font-size: 8.5pt; font-weight: 600; color: #3b4637; }
.rpt-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 4px; }
.rpt-table thead { display: table-header-group; }
.rpt-table th { background: #eef3e8; color: #2b3a26; font-weight: 600; text-align: left; padding: 5px 6px; border-bottom: 1.5px solid #b9c7ad; white-space: nowrap; }
.rpt-table td { padding: 4.5px 6px; border-bottom: 1px solid #e6eae2; vertical-align: top; word-break: break-word; }
.rpt-table tr { break-inside: avoid; }
.rpt-table tbody tr:nth-child(even) td { background: #fafbf8; }
.rpt-idx { width: 22px; color: #8a9385; text-align: right !important; }
.rpt-kv { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
.rpt-kv td { padding: 3px 0; border-bottom: 1px solid #eef1ea; }
.rpt-kv td:last-child { text-align: right; font-weight: 600; }
.rpt-pill { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 7.5pt; font-weight: 600; white-space: nowrap; border: 1px solid; }
.rpt-pill-good { color: #2f6b1c; background: #ecf5e5; border-color: #b9d8a6; }
.rpt-pill-bad { color: #8e2f6f; background: #f8eaf4; border-color: #e0b3d3; }
.rpt-pill-warn { color: #7a5a00; background: #fbf3dc; border-color: #e8d39a; }
.rpt-pill-neutral { color: #4a5446; background: #f1f3ee; border-color: #d7ddd1; }
.rpt-empty { margin: 4px 0; padding: 10px; font-size: 9pt; color: #6b7466; background: #f6f8f3; border-radius: 6px; }
.rpt-signoff { display: flex; justify-content: space-between; gap: 40px; margin-top: 40px; font-size: 9pt; color: #4a5446; break-inside: avoid; }
.rpt-signoff > div { flex: 1; }
.rpt-sign-line { border-bottom: 1px solid #8a9385; height: 28px; margin: 0 0 4px; }
.rpt-footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #d9dfd3; font-size: 7.5pt; color: #8a9385; text-align: center; }
@media (max-width: 720px) { .report-page { padding: 18px 14px; } .rpt-kpis { grid-template-columns: repeat(2, 1fr); } .rpt-grid-2 { grid-template-columns: 1fr; } .rpt-header { flex-direction: column; } .rpt-meta { text-align: left; } }
@media print {
  @page { size: A4; margin: 12mm 11mm 14mm; }
  html, body { background: #fff !important; overflow: visible !important; height: auto !important; }
  #root { display: none !important; }
  .report-overlay { position: static !important; overflow: visible !important; background: #fff !important; }
  .report-toolbar { display: none !important; }
  .report-page { width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
  .rpt-break { break-before: page; }
  .rpt * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export default function ReportDocument({ sections, loginRange, admin, onClose }: { sections: ReportSection[]; loginRange: LoginRange; admin: LoggedInAdmin | null; onClose: () => void }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const ordered = REPORT_SECTIONS.map((item) => item.key).filter((key) => sections.includes(key));
  const sectionKey = ordered.join(",");

  useEffect(() => {
    let cancelled = false;
    loadReportData(sectionKey.split(",") as ReportSection[])
      .then((result) => !cancelled && setData(result))
      .catch((err: unknown) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [sectionKey]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `AyurvedAI_Admin_Report_${new Date().toISOString().slice(0, 10)}`;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.title = previousTitle;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Administration report preview">
      <style>{REPORT_CSS}</style>
      <div className="report-toolbar">
        <div>
          <p className="text-sm font-medium text-[#EAF2DD]">Report Preview</p>
          <p className="text-xs text-[#8FA080]">{ordered.length} section{ordered.length === 1 ? "" : "s"} · Use "Save as PDF" as the destination in the print dialog to download a PDF.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-xl border border-[#8FAF5A]/25 px-4 py-2 text-sm text-[#A9C97C] hover:bg-[#8FAF5A]/10">
            <Icons.X /> Close
          </button>
          <button
            type="button"
            disabled={!data}
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-[#12200F] disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)" }}
          >
            <Icons.Printer /> Print / Save as PDF
          </button>
        </div>
      </div>
      <div className="report-page">
        {error ? (
          <p className="text-sm text-red-700">Could not build the report: {error}</p>
        ) : data ? (
          <ReportBody data={data} sections={ordered} loginRange={loginRange} admin={admin} />
        ) : (
          <p className="py-20 text-center text-sm text-[#4a5446]">Collecting report data…</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
