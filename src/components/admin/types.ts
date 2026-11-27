export type AdminView =
  | "dashboard"
  | "reports"
  | "users"
  | "logins"
  | "knowledge"
  | "herbs"
  | "medicines"
  | "lifestyle"
  | "clinics"
  | "safety"
  | "health";

export type LoggedInAdmin = {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
};

export type User = {
  id: number;
  name: string;
  email: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string | null;
  last_login: string | null;
};

export type LoginRecord = {
  id: number;
  user_id: number | null;
  email: string;
  login_at: string;
  ip_address: string | null;
  user_agent: string | null;
  status: "success" | "failed";
  failure_reason: string | null;
};

export type DocumentItem = {
  filename: string;
  name: string;
  extension: string;
  size: number;
  uploaded_at: string;
  chunks: number | null;
};

export type CatalogStatus = "approved" | "draft";
export type RuleStatus = "approved" | "draft" | "rejected";

export type Herb = {
  id: number;
  slug: string;
  name_english: string | null;
  name_sanskrit: string | null;
  name_hindi: string | null;
  name_gujarati: string | null;
  botanical_name: string | null;
  family: string | null;
  aliases: string[];
  toxic: boolean;
  status: CatalogStatus;
  has_profile: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type Medicine = {
  id: number;
  slug: string;
  name: string;
  form: string;
  aliases: string[];
  ingredients: string[];
  source_ids: (string | number)[];
  summary: string | null;
  status: CatalogStatus;
  created_at: string | null;
  updated_at: string | null;
};

export type SourceItem = {
  id: number;
  value: string | number;
  title: string;
  kind: string;
  document_id: string | null;
  note: string | null;
};

export type FoodRule = {
  id: number;
  food: string;
  category: "favour" | "limit";
  description: string;
  diet_tags: string[];
  caution_note: string | null;
  status: RuleStatus;
  source: string;
};

export type RoutineItem = {
  id: number;
  slot: string;
  title: string;
  description: string;
  dosha_tags: string[];
  season_tags: string[];
  status: RuleStatus;
  source: string;
};

export type SavedPlan = {
  id: number;
  created_at: string | null;
  season: string;
  dominant: string[];
};

export type LifestyleData = {
  food_rules: FoodRule[];
  routine_items: RoutineItem[];
  seasons: string[];
  slots: string[];
  plans: SavedPlan[];
};

export type Clinic = {
  id: number;
  name: string;
  kind: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  website: string;
  speciality: string;
  timings: string;
  lat: number;
  lng: number;
  created_at: string | null;
};

export type SafetyEvent = {
  id: number;
  context: string;
  level: string;
  flags: string[];
  created_at: string | null;
  user_hash: string | null;
};

export type SafetyRulesInfo = {
  version: string | null;
  emergency_patterns?: number;
  unsafe_patterns?: number;
  special_groups?: string[];
  phone_numbers?: Record<string, string>;
};

export type HealthCheck = {
  key: string;
  name: string;
  status: "ok" | "warning" | "error";
  detail: string;
};

export type HealthReport = {
  checked_at: string;
  overall: "ok" | "warning" | "error";
  checks: HealthCheck[];
};

export type LabelCount = { label: string; count: number };

export type StatusCounts = { total: number; approved: number; draft: number; rejected: number };

export type Summary = {
  generated_at: string;
  users: { total: number; active: number; inactive: number };
  logins: {
    total: number;
    success: number;
    failed: number;
    failed_today: number;
    per_day: { date: string; success: number; failed: number }[];
    failure_reasons: { reason: string; count: number }[];
  };
  registrations_per_month: { month: string; count: number }[];
  knowledge_base: { files: number; chunks: number; chunks_per_file: Record<string, number> };
  herbs: StatusCounts;
  medicines: StatusCounts;
  food_rules: StatusCounts;
  routine_items: StatusCounts;
  lifestyle_plans: { total: number; by_season: LabelCount[]; by_dosha: LabelCount[] };
  clinics: { total: number; by_kind: LabelCount[] };
  safety: { total: number; last_7_days: number; by_level: LabelCount[]; by_context: LabelCount[] };
  recent_activity: { type: string; title: string; detail: string; at: string | null }[];
};
