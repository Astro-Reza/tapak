// Access to the provenance catalog (data/physiology/catalog.json). No rendering code.
// A value can be used in a calculation only if its catalog entry says so; lookups by id fail loudly.
import catalog from '../data/physiology/catalog.json' with { type: 'json' };

const byId = new Map(catalog.values.map((v) => [v.id, v]));
const sources = new Map(catalog.sources.map((s) => [s.id, s]));
for (const v of catalog.values) if (!sources.has(v.source)) throw new Error(`catalog: ${v.id} cites unknown source ${v.source}`);

export const CATALOG = catalog;
export function value(id) {
  const v = byId.get(id);
  if (!v) throw new Error(`catalog: no value ${id}`);
  return v;
}
export const source = (id) => sources.get(id) ?? null;
/** "CHAPPELL-2010 Table 4, p.13 (PDF p.21)" */
export const cite = (id) => { const v = value(id); return `${v.source} ${v.location}`; };

export const ACTIVITIES = Object.keys(catalog.activities);
/** Activity O2 uptake in mL/kg/min (per kg body mass) with its citation. */
export function activityVo2(activity) {
  const a = catalog.activities[activity];
  if (!a) throw new Error(`catalog: unknown activity ${activity}`);
  const v = value(a.value);
  if (v.unit !== 'mL/kg/min' || typeof v.value !== 'number') throw new Error(`catalog: ${v.id} is not a mL/kg/min number`);
  return { activity, label: a.label, mlKgMin: v.value, id: v.id, cite: cite(v.id), applicability: v.marsApplicability };
}
