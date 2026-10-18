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

const inputCls =
  "w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none";

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
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-2xl font-bold">Admin</h1>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <input
          className={inputCls}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
        />
        <input
          className={inputCls}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <button
          type="submit"
          className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign in
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
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

  const running = runs.find((r) => r.status === "running");

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex items-center gap-3 text-sm">
          {running && (
            <span className="text-slate-500">
              Scraping…
              {running.segments_total > 0
                ? ` ${running.segments_done}/${running.segments_total}`
                : ""}
              {running.current_segment ? ` · ${running.current_segment}` : ""}
            </span>
          )}
          <button
            onClick={onLogout}
            className="rounded border border-slate-200 px-3 py-1.5 text-slate-600 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Actions */}
      <section className="mt-4 flex flex-wrap items-center gap-2">
        <Button label="Run quick scrape" onClick={() => action("Quick scrape", () => triggerScrape())} />
        <Button label="Run full scrape" onClick={() => action("Full scrape", triggerFullScrape)} primary />
        <Button label="Retrain model" onClick={() => action("Retraining", triggerRetrain)} />
        <Button label="Recompute predictions" onClick={() => action("Recompute", triggerRecompute)} />
        <Button label="Refresh" onClick={refresh} />
        {message && <span className="text-sm text-slate-400">{message}</span>}
      </section>

      {/* Models */}
      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
          Model versions
        </h2>
        <table className="mt-3 w-full text-[15px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="py-2.5 pr-4">Model</th>
              <th className="px-3 py-2.5 text-right">Rows</th>
              <th className="px-3 py-2.5 text-right">MAE</th>
              <th className="px-3 py-2.5 text-right">R²</th>
              <th className="px-3 py-2.5 text-right">Interval</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-2.5 pr-4 font-medium">{m.name}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">
                  {m.dataset_rows.toLocaleString("en-US")}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-600">
                  {m.metrics ? formatPrice(m.metrics.mae) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-600">
                  {m.metrics?.r2 ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-600">
                  {m.metrics ? `± ${formatPrice(m.metrics.conformal_q)}` : "—"}
                </td>
                <td
                  className={`px-3 py-2.5 text-sm font-medium ${
                    m.is_active ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {m.is_active ? "active" : "archived"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Scrape runs */}
      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
          Scrape runs
        </h2>
        <table className="mt-3 w-full text-[15px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="py-2.5 pr-4">Started</th>
              <th className="px-3 py-2.5">Kind</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">New</th>
              <th className="px-3 py-2.5 text-right">Updated</th>
              <th className="px-3 py-2.5">Progress</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2.5 pr-4 text-slate-600">
                  {new Date(r.started_at).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-slate-600">{r.kind}</td>
                <td
                  className={`px-3 py-2.5 text-sm font-medium ${
                    r.status === "success"
                      ? "text-emerald-600"
                      : r.status === "failed"
                        ? "text-red-500"
                        : "text-amber-600"
                  }`}
                >
                  {r.status}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-600">
                  {r.listings_new}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-600">
                  {r.listings_updated}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">
                  {r.segments_total > 0
                    ? `${r.segments_done}/${r.segments_total}`
                    : "—"}
                  {r.segments_failed > 0 && (
                    <span className="text-red-500"> ({r.segments_failed} failed)</span>
                  )}
                  {r.current_segment ? ` · ${r.current_segment}` : ""}
                </td>
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
          ? "bg-slate-900 text-white hover:bg-slate-800"
          : "border border-slate-200 text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}
