import { useState } from "react";
import { Link } from "react-router-dom";
import {
  askAnswer,
  askSearch,
  type AskMatch,
  type AskSearchResult,
} from "../api";
import ErrorState from "../components/ErrorState";
import { formatKm, formatPrice } from "../components/format";

const EXAMPLES = [
  "Best deals under 20k EUR",
  "Economical diesel estate up to 15000 EUR, manual",
  "Electric SUVs from 2021",
  "Cheap cars with low mileage under 10k EUR",
  "4x4 cars with at least 200 kW",
];

/** Natural-language search over the market ("Ask AI"). */
export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<AskSearchResult | null>(null);
  const [answer, setAnswer] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setError(null);
    setAnswer("");
    setResults(null);
    setThinking(true);
    try {
      // Matches first (fast), then the AI commentary when it is ready.
      const found = await askSearch(text);
      setResults(found);
      const answered = await askAnswer(text);
      setAnswer(answered.answer);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="mt-8">
      <h1 className="text-2xl font-bold">Ask the market</h1>
      <p className="mt-1 text-slate-500">
        Ask in any language - the data comes from live listings and the answer
        is written in English.
      </p>

      {/* Question box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="mt-5 flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='e.g. "best deals under 20k EUR, diesel estate"'
          className="flex-1 rounded border border-slate-300 bg-white px-4 py-2.5 text-base focus:border-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={thinking}
          className="rounded bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {thinking ? "Thinking…" : "Ask"}
        </button>
      </form>

      {/* Example questions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            onClick={() => {
              setQuestion(example);
              ask(example);
            }}
            className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900"
          >
            {example}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={() => ask(question)} />}

      {results && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Matches */}
          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
              Matching offers ({results.summary.matches_total.toLocaleString("en-US")} found)
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-[15px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4">Car</th>
                    <th className="px-3 py-2 text-right">Year</th>
                    <th className="px-3 py-2 text-right">KM</th>
                    <th className="px-3 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {results.matches.map((car: AskMatch) => (
                    <tr key={car.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4">
                        <Link to={`/car/${car.id}`} className="font-medium text-blue-700">
                          {car.title}
                        </Link>
                        <div className="text-xs text-slate-400">
                          {car.power_kw ? `${car.power_kw} kW · ` : ""}
                          {car.fuel ?? ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{car.year}</td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatKm(car.mileage_km)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatPrice(car.price_eur)}
                      </td>
                    </tr>
                  ))}
                  {results.matches.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        No offers matched - try broader wording.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* AI answer */}
          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
              AI analysis
            </h2>
            <div className="mt-3 min-h-40 whitespace-pre-line border border-slate-200 bg-white px-6 py-5 text-[15px] leading-7">
              {answer ? (
                answer
              ) : (
                <span className="text-slate-400">
                  {thinking
                    ? "The local model is writing the analysis… this can take a minute on small hardware."
                    : "The analysis will appear here."}
                </span>
              )}
            </div>
            {answer && (
              <p className="mt-2 text-xs text-slate-400">
                Generated by a local LLM from the matched offers only - the
                listing data stays the source of truth.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
