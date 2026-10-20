import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getCompareIds } from "../compare";

export default function Header() {
  const [compareCount, setCompareCount] = useState(0);

  useEffect(() => {
    const sync = () => setCompareCount(getCompareIds().length);
    sync();
    window.addEventListener("compare-changed", sync);
    return () => window.removeEventListener("compare-changed", sync);
  }, []);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-none items-center gap-1 px-8 py-3">
        <Link to="/" className="mr-4 text-lg font-bold tracking-tight">
          Car<span className="text-emerald-600">Market</span>Analyzer
        </Link>
        <NavItem to="/" label="Listings" end />
        <NavItem to="/ask" label="Ask AI" />
        <NavItem to="/calculator" label="Price calculator" />
        <NavItem to="/insights" label="Insights" />
        <NavItem
          to="/compare"
          label={compareCount > 0 ? `Compare (${compareCount})` : "Compare"}
        />
        <NavItem to="/admin" label="Admin" />
      </div>
    </header>
  );
}

function NavItem({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded px-3 py-1.5 text-sm ${
          isActive
            ? "bg-slate-900 font-medium text-white"
            : "text-slate-600 hover:text-slate-900"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
