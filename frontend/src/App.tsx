import { Route, Routes } from "react-router-dom";
import Header from "./components/Header";
import AskPage from "./pages/AskPage";
import CarsPage from "./pages/CarsPage";
import CarPage from "./pages/CarPage";
import CalculatorPage from "./pages/CalculatorPage";
import InsightsPage from "./pages/InsightsPage";
import ComparePage from "./pages/ComparePage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-none px-8 pb-16">
        <Routes>
          <Route path="/" element={<CarsPage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="/car/:id" element={<CarPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/charts" element={<InsightsPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-100 py-6 text-center text-xs text-slate-400">
        <p>
          Car Market Analyzer — open-source demo. Listings belong to their
          source site.
        </p>
        <p className="mt-1">
          <a
            href="https://github.com/matejbujnak/car-platform"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-900"
          >
            Source code on GitHub ↗
          </a>
        </p>
      </footer>
    </div>
  );
}
