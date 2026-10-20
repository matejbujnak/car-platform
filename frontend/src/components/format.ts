export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value).toLocaleString("en-US")} €`;
}

export function formatKm(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US")} km`;
}

// The source data keeps the original labels ("6-st. manuálna", "Predný" ...);
// these helpers show them as normal English without touching what the model
// was trained on.

export function formatGearbox(value?: string | null): string {
  if (!value) return "—";
  const v = value.toLowerCase();
  const speeds = v.match(/(\d+)\s*-?\s*st/);
  const prefix = speeds ? `${speeds[1]}-speed ` : "";
  if (v.includes("bezstup")) return `${prefix}CVT automatic`;
  if (v.includes("manu")) return `${prefix}manual`;
  if (v.includes("auto")) return `${prefix}automatic`;
  return value;
}

export function formatDrive(value?: string | null): string {
  if (!value) return "—";
  const v = value.toLowerCase();
  if (v.includes("predn") || v.includes("front")) return "Front-wheel drive";
  if (v.includes("zadn") || v.includes("rear")) return "Rear-wheel drive";
  if (v.includes("4x4") || v.includes("awd")) return "4x4";
  return v === "iné" || v === "ine" ? "Other" : value;
}

const FUEL_LABELS: Record<string, string> = {
  "Benzín": "Petrol",
  "Petrol": "Petrol",
  "Diesel": "Diesel",
  "Elektromotor": "Electric",
  "Hybrid (Elektrina - benzín)": "Hybrid (petrol)",
  "Hybrid (Elektrina - diesel)": "Hybrid (diesel)",
  "Plug-in hybrid": "Plug-in hybrid",
  "CNG + benzín": "CNG",
  "LPG + benzín": "LPG",
  "Nedefinované": "Unspecified",
};

export function formatFuel(value?: string | null): string {
  if (!value) return "—";
  return FUEL_LABELS[value] ?? value;
}

// Select options: labels are for the user, values are the raw strings the
// model was trained on (changing a value would skew the prediction).
export const FUEL_OPTIONS = [
  ["Petrol", "Benzín"],
  ["Diesel", "Diesel"],
  ["Hybrid (petrol)", "Hybrid (Elektrina - benzín)"],
  ["Hybrid (diesel)", "Hybrid (Elektrina - diesel)"],
  ["Plug-in hybrid", "Plug-in hybrid"],
  ["Electric", "Elektromotor"],
  ["LPG", "LPG + benzín"],
  ["CNG", "CNG + benzín"],
];

export const GEARBOX_OPTIONS = [
  ["Manual", "manual"],
  ["Automatic", "automatic"],
];

export const BODY_OPTIONS = [
  ["Sedan", "Sedan"],
  ["Estate", "Combi"],
  ["Hatchback", "Hatchback"],
  ["SUV", "SUV"],
  ["SUV / off-road", "SUV / Off-road"],
  ["Coupé", "Coupé"],
  ["Convertible", "Cabrio"],
  ["Liftback", "Liftback"],
  ["Minivan / van", "Mpv/Van"],
  ["Limousine", "Limuzína"],
  ["Other", "Iné"],
];

export const DRIVE_OPTIONS = [
  ["Front-wheel drive", "Predný"],
  ["Rear-wheel drive", "Zadný"],
  ["4x4", "4x4"],
  ["Other", "Iné"],
];

// Filter values for the drive column (the data mixes Slovak and English
// labels, so the backend matches by meaning).
export const DRIVE_FILTER_OPTIONS = [
  ["Front-wheel drive", "front"],
  ["Rear-wheel drive", "rear"],
  ["4x4", "4x4"],
  ["Other", "other"],
];

export const SELLER_OPTIONS = [
  ["Dealer", "dealer"],
  ["Private", "private"],
];
