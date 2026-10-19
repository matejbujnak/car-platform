import { useState } from "react";

interface Props {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  /** [label, value] pairs - labels are shown, values are sent to the API. */
  options: string[][];
  /** Max rows rendered at once (search narrows the list). */
  maxVisible?: number;
}

/** Dropdown with a search box and checkboxes; value is a comma-joined list. */
export default function MultiSelect({
  placeholder,
  value,
  onChange,
  options,
  maxVisible = 150,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = value ? value.split(",").filter(Boolean) : [];
  const visible = options
    .filter(([label]) => label.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, maxVisible);

  const toggle = (optionValue: string) => {
    const next = selected.includes(optionValue)
      ? selected.filter((v) => v !== optionValue)
      : [...selected, optionValue];
    onChange(next.join(","));
  };

  const labelOf = (optionValue: string) =>
    options.find(([, v]) => v === optionValue)?.[0] ?? optionValue;

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      >
        {selected.length === 0
          ? placeholder
          : selected.length === 1
            ? labelOf(selected[0])
            : `${placeholder} (${selected.length})`}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-64 rounded border border-slate-200 bg-white shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${placeholder.toLowerCase()}…`}
              className="w-full border-b border-slate-100 px-3 py-2 text-sm focus:outline-none"
            />
            <div className="max-h-64 overflow-y-auto py-1">
              {visible.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-400">No matches</p>
              )}
              {visible.map(([label, optionValue]) => (
                <label
                  key={optionValue}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(optionValue)}
                    onChange={() => toggle(optionValue)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="w-full border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-500 hover:text-slate-900"
              >
                Clear selection
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
