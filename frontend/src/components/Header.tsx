import { Link, NavLink } from "react-router-dom";

export default function Header() {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-none items-center gap-1 px-8 py-3">
        <Link to="/" className="mr-4 text-lg font-bold tracking-tight">
          Car<span className="text-emerald-600">Market</span>Analyzer
        </Link>
        <NavItem to="/" label="Listings" end />
        <NavItem to="/calculator" label="Price calculator" />
        <NavItem to="/charts" label="Charts" />
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
