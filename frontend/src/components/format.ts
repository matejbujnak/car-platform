export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value).toLocaleString("en-US")} €`;
}

export function formatKm(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US")} km`;
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
  ["Manual", "manuálna"],
  ["Automatic", "automatická"],
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

export const SELLER_OPTIONS = [
  ["Dealer", "dealer"],
  ["Private", "private"],
];
