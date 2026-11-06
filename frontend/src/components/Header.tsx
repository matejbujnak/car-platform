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
      <div className="mx-auto flex max-w-none flex-col gap-2 px-4 py-3 sm:px-8 md:flex-row md:items-center md:gap-1">
        <Link to="/" className="shrink-0 text-lg font-bold tracking-tight md:mr-4">
          Car<span className="text-emerald-600">Market</span>Analyzer
        </Link>
        {/* On phones the nav scrolls sideways instead of wrapping. */}
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-8 sm:px-8 md:mx-0 md:px-0">
          <NavItem to="/" label="Listings" end />
          <NavItem to="/calculator" label="Price calculator" />
          <NavItem to="/insights" label="Insights" />
          <NavItem
            to="/compare"
            label={compareCount > 0 ? `Compare (${compareCount})` : "Compare"}
          />
          <NavItem to="/admin" label="Admin" />
        </nav>
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
        `shrink-0 whitespace-nowrap rounded px-3 py-1.5 text-sm ${
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
