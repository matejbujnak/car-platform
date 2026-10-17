import { Route, Routes } from "react-router-dom";
import Header from "./components/Header";
import CarsPage from "./pages/CarsPage";
import CarPage from "./pages/CarPage";
import CalculatorPage from "./pages/CalculatorPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <Routes>
          <Route path="/" element={<CarsPage />} />
          <Route path="/car/:id" element={<CarPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-400">
        Car Market Analyzer — open-source demo. Listings belong to their source
        site.
      </footer>
    </div>
  );
}
