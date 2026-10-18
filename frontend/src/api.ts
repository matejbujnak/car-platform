// API client. In dev, VITE_API_URL points at the backend; in production the
// app is served from the same origin and requests go through the nginx proxy.
const API = import.meta.env.VITE_API_URL ?? "";

export type Verdict = "cheap" | "fair" | "overpriced";

export interface Listing {
  id: number;
  source_id: string;
  url: string;
  title: string;
  make: string;
  model: string;
  year: number;
  mileage_km: number | null;
  fuel: string | null;
  power_kw: number | null;
  engine_cc: number | null;
  gearbox: string | null;
  body: string | null;
  drive: string | null;
  seller_type: string | null;
  price_eur: number | null;
  last_seen: string;
  fair_price_eur?: number;
  interval_low_eur?: number;
  interval_high_eur?: number;
  deal_verdict?: Verdict | null;
  deal_score?: number | null;
}

export interface Stats {
  listings_total: number;
  by_verdict: Record<Verdict, number>;
  makes: string[];
  model_name: string | null;
}

export interface Prediction {
  fair_price_eur: number;
  interval_low_eur: number;
  interval_high_eur: number;
  model_name: string;
  deal_verdict?: Verdict;
  deal_score?: number;
}

export interface ScrapeRun {
  id: number;
  kind: "quick" | "full";
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  current_segment: string | null;
  cursor: number | null;
  listings_new: number;
  listings_updated: number;
  error: string | null;
}

export interface ModelInfo {
  id: number;
  name: string;
  dataset_rows: number;
  metrics: Record<string, number> | null;
  is_active: boolean;
  trained_at: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/json";

  const resp = await fetch(`${API}${path}`, { ...options, headers });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null);
    throw new Error(detail?.detail ?? `Request failed (${resp.status})`);
  }
  return resp.json();
}

export function fetchStats(): Promise<Stats> {
  return request("/api/stats");
}

export function fetchListings(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  return request<{ total: number; items: Listing[] }>(`/api/listings?${qs}`);
}

export function fetchListing(id: number): Promise<Listing> {
  return request(`/api/listings/${id}`);
}

export function predict(car: Record<string, unknown>): Promise<Prediction> {
  return request("/api/predict", { method: "POST", body: JSON.stringify(car) });
}

export async function login(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username, password });
  const resp = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) throw new Error("Invalid username or password");
  const data = await resp.json();
  localStorage.setItem("token", data.access_token);
  return data.access_token;
}

export function logout(): void {
  localStorage.removeItem("token");
}

export function fetchScrapeRuns(): Promise<ScrapeRun[]> {
  return request("/api/admin/scrape/runs");
}

export function fetchModels(): Promise<ModelInfo[]> {
  return request("/api/admin/models");
}

export function triggerScrape(pages = 2): Promise<unknown> {
  return request(`/api/admin/scrape?pages=${pages}`, { method: "POST" });
}

export function triggerFullScrape(): Promise<unknown> {
  return request("/api/admin/scrape/full", { method: "POST" });
}

export function triggerRetrain(): Promise<unknown> {
  return request("/api/admin/models/retrain", { method: "POST" });
}

export function triggerRecompute(): Promise<unknown> {
  return request("/api/admin/predictions/recompute", { method: "POST" });
}
