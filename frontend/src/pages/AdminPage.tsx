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
    <div className="mx-auto mt-12 max-w-sm">
      <h1 className="text-xl font-semibold text-slate-900">Admin login</h1>
      <form onSubmit={submit} className="mt-3 space-y-4 border border-slate-200 bg-white px-6 py-5">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
        />
        <button
          type="submit"
          className="w-full rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Sign in
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
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
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Admin</h1>
        <button
          onClick={onLogout}
          className="rounded border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>

      {/* Actions */}
      <section className="mt-4 flex flex-wrap items-center gap-2">
        <Button label="Run quick scrape" onClick={() => action("Quick scrape", () => triggerScrape())} />
        <Button label="Run full scrape" onClick={() => action("Full scrape", triggerFullScrape)} primary />
        <Button label="Retrain model" onClick={() => action("Retraining", triggerRetrain)} />
        <Button label="Recompute predictions" onClick={() => action("Recompute", triggerRecompute)} />
        <Button label="Refresh" onClick={refresh} />
        {message && <span className="text-sm text-slate-500">{message}</span>}
      </section>

      {/* Models */}
      <section className="mt-6 border border-slate-200 bg-white px-6 py-5">
        <h2 className="text-sm font-semibold text-slate-900">Model versions</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">Model</th>
              <th className="pb-2 font-medium">Rows</th>
              <th className="pb-2 font-medium">MAE</th>
              <th className="pb-2 font-medium">R²</th>
              <th className="pb-2 font-medium">Interval</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {models.map((m) => (
              <tr key={m.id}>
                <td className="py-2 font-medium text-slate-800">{m.name}</td>
                <td>{m.dataset_rows.toLocaleString("en-US")}</td>
                <td>{m.metrics ? formatPrice(m.metrics.mae) : "—"}</td>
                <td>{m.metrics?.r2 ?? "—"}</td>
                <td>{m.metrics ? `± ${formatPrice(m.metrics.conformal_q)}` : "—"}</td>
                <td>
                  <span
                    className={`rounded-sm px-2 py-0.5 text-xs ${
                      m.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {m.is_active ? "active" : "archived"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Scrape runs */}
      <section className="mt-6 border border-slate-200 bg-white px-6 py-5">
        <h2 className="text-sm font-semibold text-slate-900">Scrape runs</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">Started</th>
              <th className="pb-2 font-medium">Kind</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">New</th>
              <th className="pb-2 font-medium">Updated</th>
              <th className="pb-2 font-medium">Segment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="py-2">{new Date(r.started_at).toLocaleString()}</td>
                <td>{r.kind}</td>
                <td>
                  <span
                    className={`rounded-sm px-2 py-0.5 text-xs ${
                      r.status === "success"
                        ? "bg-green-100 text-green-800"
                        : r.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td>{r.listings_new}</td>
                <td>{r.listings_updated}</td>
                <td className="text-slate-500">{r.current_segment ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Button({
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
      className={`rounded px-4 py-1.5 text-sm font-medium ${
        primary
          ? "bg-blue-700 text-white hover:bg-blue-800"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
