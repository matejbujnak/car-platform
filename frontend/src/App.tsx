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
      <main className="mx-auto max-w-none px-8 pb-16">
        <Routes>
          <Route path="/" element={<CarsPage />} />
          <Route path="/car/:id" element={<CarPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-100 py-5 text-center text-xs text-slate-400">
        Car Market Analyzer — open-source demo. Listings belong to their source
        site.
      </footer>
    </div>
  );
}
