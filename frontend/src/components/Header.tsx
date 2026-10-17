import { NavLink } from "react-router-dom";

export default function Header() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 text-sm ${
      isActive
        ? "border-b-2 border-blue-700 font-medium text-blue-700"
        : "border-b-2 border-transparent text-slate-600 hover:text-slate-900"
    }`;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4">
        <div className="py-3">
          <span className="text-lg font-semibold text-slate-900">
            Car Market Analyzer
          </span>
        </div>
        <nav className="flex items-center">
          <NavLink to="/" className={link} end>
            Cars
          </NavLink>
          <NavLink to="/calculator" className={link}>
            Price calculator
          </NavLink>
          <NavLink to="/admin" className={link}>
            Admin
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
