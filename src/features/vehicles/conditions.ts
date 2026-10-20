/** Etichette e liste del check delle condizioni (sezione 6). Le chiavi sono quelle salvate nel database. */
export const PHASE: Record<string, string> = { intake: "Ingresso", during: "Durante la lavorazione", delivery: "Consegna" };
export const FUEL: Record<string, string> = { empty: "Riserva", quarter: "1/4", half: "1/2", three_quarters: "3/4", full: "Pieno" };
export const DAMAGE: Record<string, string> = { scratch: "Graffio", dent: "Ammaccatura", break: "Rottura", wear: "Usura" };
export const SEVERITY: Record<string, string> = { light: "Lieve", medium: "Media", severe: "Grave" };
export const ZONES: Record<string, string> = {
  front_bumper: "Paraurti anteriore", hood: "Cofano", windshield: "Parabrezza", roof: "Tetto",
  front_left_fender: "Parafango ant. sx", front_right_fender: "Parafango ant. dx",
  front_left_door: "Porta ant. sx", front_right_door: "Porta ant. dx", rear_left_door: "Porta post. sx", rear_right_door: "Porta post. dx",
  rear_left_fender: "Parafango post. sx", rear_right_fender: "Parafango post. dx", left_mirror: "Specchietto sx", right_mirror: "Specchietto dx",
  rear_bumper: "Paraurti posteriore", trunk: "Portellone", wheels: "Cerchi", interior: "Interni", seats: "Sedili",
};
/** Foto obbligatorie per ogni check di ingresso e consegna; ogni danno ha in più la sua foto. */
export const REQUIRED_PHOTOS: Record<string, string> = {
  front_left: "Anteriore sinistro", front_right: "Anteriore destro", rear_left: "Posteriore sinistro", rear_right: "Posteriore destro",
  left_side: "Fianco sinistro", right_side: "Fianco destro", interior_front: "Interni anteriori", interior_rear: "Interni posteriori",
  dashboard: "Cruscotto acceso", trunk: "Bagagliaio",
};
export const DOCUMENTS: Record<string, string> = {
  registration: "Carta di circolazione", ownership: "Certificato di proprietà", manual: "Libretto d'uso", service_book: "Libretto tagliandi", spare: "Ruota di scorta o kit",
};
export const WARNING_LIGHTS: Record<string, string> = {
  engine: "Motore", abs: "ABS", airbag: "Airbag", oil: "Olio", battery: "Batteria", brakes: "Freni", tpms: "Pressione gomme", other: "Altra spia",
};
export const TIRES: Record<string, string> = { fl: "Ant. sx", fr: "Ant. dx", rl: "Post. sx", rr: "Post. dx" };
export const TIRE_STATE: Record<string, string> = { good: "Buono", worn: "Usurato", replace: "Da sostituire" };
export const WORK: Record<string, string> = { bodywork: "Carrozzeria", mechanical: "Meccanica", cleaning: "Pulizia", documents: "Documenti" };
export const WORK_STATUS: Record<string, string> = { planned: "Prevista", in_progress: "In corso", done: "Fatta" };
export const zoneLabel = (z: string | null | undefined) => (z ? ZONES[z] ?? REQUIRED_PHOTOS[z] ?? z : "—");

export interface Damage { zone: string; damage_type: string; severity: string; notes: string | null; repaired: boolean }
export interface Condition {
  id: string; vehicle_id: string; phase: string; taken_at: string; taken_by: string | null; fuel_level: string | null; mileage_km: number | null;
  keys_count: number | null; documents: Record<string, boolean> | null; warning_lights: string[] | null; tires: Record<string, { state: string; mm: number | null }> | null;
  notes: string | null; ai_review: AiReview | null;
}
export interface AiReview {
  mock?: boolean; model?: string; summary: string; at?: string; from_condition_id?: string;
  findings: Array<{ zone: string; kind: string; description: string; confidence: string }>;
}

/** Differenze tra due check, come compare_conditions nel database: danni nuovi, riparati, carburante, km non giustificati. */
export function diffConditions(prev: { c: Condition; d: Damage[] }, cur: { c: Condition; d: Damage[] }) {
  const before = new Set(prev.d.map((x) => `${x.zone}|${x.damage_type}`));
  const delta = (cur.c.mileage_km ?? 0) - (prev.c.mileage_km ?? 0);
  return {
    newDamages: cur.d.filter((x) => !before.has(`${x.zone}|${x.damage_type}`)),
    repaired: cur.d.filter((x) => x.repaired),
    fuelChanged: prev.c.fuel_level !== cur.c.fuel_level,
    mileageDelta: delta,
    mileageUnjustified: delta > 50,
  };
}
