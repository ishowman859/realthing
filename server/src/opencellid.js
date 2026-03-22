import { pool } from "./db.js";

/** 앱 cellScan.radioType → OpenCellID CSV radio 컬럼 */
export function normalizeRadioForDb(radioType) {
  const r = String(radioType ?? "")
    .trim()
    .toLowerCase();
  if (r === "gsm") return "GSM";
  if (r === "wcdma" || r === "umts") return "UMTS";
  if (r === "lte") return "LTE";
  if (r === "nr" || r === "5g") return "NR";
  if (!r) return "";
  return r.toUpperCase().slice(0, 8);
}

/**
 * @param {{ radio: string, mcc: number, mnc: number, area: number, cellId: string }} key
 */
export async function lookupOpenCellidCell(key) {
  const { rows } = await pool.query(
    `
      SELECT lat, lon, range_m, samples
      FROM opencellid_cells
      WHERE radio = $1 AND mcc = $2 AND mnc = $3 AND area = $4 AND cell_id = $5
      LIMIT 1
    `,
    [key.radio, key.mcc, key.mnc, key.area, key.cellId]
  );
  return rows[0] ?? null;
}

export async function hasOpenCellidData() {
  try {
    const { rows } = await pool.query(
      "SELECT 1 AS ok FROM opencellid_cells LIMIT 1"
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function countOpenCellidRows() {
  try {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::bigint AS n FROM opencellid_cells"
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}
