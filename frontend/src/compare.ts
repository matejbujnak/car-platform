// Up to three cars can be kept for comparison (stored in the browser).

const KEY = "compareIds";
export const MAX_COMPARE = 3;

export function getCompareIds(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v) => typeof v === "number") : [];
  } catch {
    return [];
  }
}

export function toggleCompare(id: number): number[] {
  const current = getCompareIds();
  const next = current.includes(id)
    ? current.filter((v) => v !== id)
    : [...current, id].slice(-MAX_COMPARE);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("compare-changed"));
  return next;
}

export function clearCompare(): void {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("compare-changed"));
}
