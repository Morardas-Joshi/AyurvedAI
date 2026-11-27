export type ReportSection = "summary" | "users" | "logins" | "knowledge" | "herbs" | "medicines" | "lifestyle" | "clinics" | "safety" | "health";
export type LoginRange = "all" | "30" | "7";

export const REPORT_SECTIONS: { key: ReportSection; title: string; description: string }[] = [
  { key: "summary", title: "Executive Summary", description: "Key figures, charts and observations" },
  { key: "users", title: "User Report", description: "Every registered account with status and last login" },
  { key: "logins", title: "Login Activity", description: "Authentication attempts, outcomes and failure reasons" },
  { key: "knowledge", title: "Knowledge Base", description: "Documents indexed for the AI assistant" },
  { key: "herbs", title: "Herb Catalog", description: "All herbs with names, family and review status" },
  { key: "medicines", title: "Medicine Catalog", description: "Formulations with form, ingredients and status" },
  { key: "lifestyle", title: "Lifestyle Guidelines", description: "Food rules, daily routine and saved-plan statistics" },
  { key: "clinics", title: "Verified Clinics", description: "Admin-verified places in the Healthcare Locator" },
  { key: "safety", title: "Safety Monitoring", description: "Safety alerts and active safety rules" },
  { key: "health", title: "System Health", description: "Status of every backend service" },
];
