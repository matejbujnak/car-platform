import { useEffect, useState } from "react";
import {
  fetchModels,
  fetchScrapeRuns,
  login,
  logout,
  triggerFullScrape,
  triggerRecompute,
  triggerRetrain,
  triggerScrape,
  type ModelInfo,
  type ScrapeRun,
} from "../api";
import { formatPrice } from "../components/format";

export default function AdminPage() {
  const [token, setToken] = useState(localStorage.getItem("token"));

  if (!token) return <Login onLogin={setToken} />;
  return <Dashboard onLogout={() => { logout(); setToken(null); }} />;
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      onLogin(await login(username, password));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Admin login</h1>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700"
        >
          Sign in
        </button>
        {error && <p className="text-sm text-rose-500">{error}</p>}
      </form>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    fetchScrapeRuns().then(setRuns).catch(console.error);
    fetchModels().then(setModels).catch(console.error);
  };
  useEffect(refresh, []);

  async function action(label: string, fn: () => Promise<unknown>) {
    setMessage(`${label} queued…`);
    try {
      await fn();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        <button
          onClick={onLogout}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
        >
          Sign out
        </button>
      </div>

      {/* Actions */}
      <section className="mt-6 flex flex-wrap gap-3">
        <Action label="Run quick scrape" onClick={() => action("Quick scrape", () => triggerScrape())} />
        <Action label="Run full scrape" onClick={() => action("Full scrape", triggerFullScrape)} primary />
        <Action label="Retrain model" onClick={() => action("Retraining", triggerRetrain)} />
        <Action label="Recompute predictions" onClick={() => action("Recompute", triggerRecompute)} />
        <button
          onClick={refresh}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
        {message && <span className="self-center text-sm text-slate-400">{message}</span>}
      </section>

      {/* Models */}
      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">Model versions</h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2">Model</th>
              <th className="pb-2">Rows</th>
              <th className="pb-2">MAE</th>
              <th className="pb-2">R²</th>
              <th className="pb-2">Interval</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-b border-slate-50">
                <td className="py-2 font-medium text-slate-800">{m.name}</td>
                <td>{m.dataset_rows.toLocaleString("en-US")}</td>
                <td>{m.metrics ? formatPrice(m.metrics.mae) : "—"}</td>
                <td>{m.metrics?.r2 ?? "—"}</td>
                <td>{m.metrics ? `± ${formatPrice(m.metrics.conformal_q)}` : "—"}</td>
                <td>
                  {m.is_active ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      archived
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Scrape runs */}
      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">Scrape runs</h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2">Started</th>
              <th className="pb-2">Kind</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">New</th>
              <th className="pb-2">Updated</th>
              <th className="pb-2">Segment</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="py-2">{new Date(r.started_at).toLocaleString()}</td>
                <td>{r.kind}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      r.status === "success"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.status === "failed"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td>{r.listings_new}</td>
                <td>{r.listings_updated}</td>
                <td className="text-slate-400">{r.current_segment ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Action({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        primary
          ? "bg-indigo-600 text-white hover:bg-indigo-700"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
