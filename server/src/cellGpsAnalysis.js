import {
  hasOpenCellidData,
  lookupOpenCellidCell,
  normalizeRadioForDb,
} from "./opencellid.js";

export function haversineMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * 메타데이터에 OpenCellID DB 기반 셀→좌표 및 GPS 거리 분석을 붙입니다.
 * @param {Record<string, unknown> | null | undefined} metadata
 * @param {{ lat: number, lng: number } | null} gps
 * @returns {Promise<Record<string, unknown>>}
 */
export async function enrichMetadataWithOpenCellid(metadata, gps) {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata }
      : {};

  const snap = base.androidRadioRawSnapshot;
  const cellScan = snap?.cellScan;
  if (!Array.isArray(cellScan) || cellScan.length === 0) {
    base.serverOpencellidAnalysis = {
      skipped: true,
      reason: "no_cell_scan",
    };
    return base;
  }

  const dbReady = await hasOpenCellidData();
  if (!dbReady) {
    base.serverOpencellidAnalysis = {
      skipped: true,
      reason: "opencellid_table_empty",
      hint: "server/scripts/import-opencellid.mjs 로 덤프를 적재하세요.",
    };
    return base;
  }

  const lookups = [];
  const estimates = [];

  const ordered = [...cellScan].sort((a, b) => {
    const ar = a?.registered === true ? 0 : 1;
    const br = b?.registered === true ? 0 : 1;
    return ar - br;
  });

  for (const row of ordered.slice(0, 24)) {
    const radio = normalizeRadioForDb(row.radioType);
    const mcc = Number(row.mobileCountryCode);
    const mnc = Number(row.mobileNetworkCode);
    const area = Number(row.locationAreaCode);
    const cellId = String(row.cellId ?? "").trim();
    if (!radio || !Number.isFinite(mcc) || !Number.isFinite(mnc) || !Number.isFinite(area) || !cellId) {
      lookups.push({
        radioType: row.radioType,
        hit: false,
        reason: "incomplete_key",
      });
      continue;
    }

    const hit = await lookupOpenCellidCell({
      radio,
      mcc,
      mnc,
      area,
      cellId,
    });

    lookups.push({
      radio,
      mcc,
      mnc,
      area,
      cellId,
      registered: row.registered === true,
      hit: !!hit,
      dbLat: hit?.lat ?? null,
      dbLon: hit?.lon ?? null,
      rangeM: hit?.range_m ?? null,
    });

    if (hit) {
      estimates.push({
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        rangeM: hit.range_m != null ? Number(hit.range_m) : null,
        weight: row.registered === true ? 2 : 1,
      });
    }
  }

  let centroid = null;
  if (estimates.length > 0) {
    let wSum = 0;
    let latSum = 0;
    let lngSum = 0;
    for (const e of estimates) {
      const w = e.weight;
      wSum += w;
      latSum += e.lat * w;
      lngSum += e.lng * w;
    }
    centroid = { lat: latSum / wSum, lng: lngSum / wSum };
  }

  const hitCount = estimates.length;
  let distanceMeters = null;
  let mismatch = "none";
  let note = "";

  if (gps && centroid) {
    distanceMeters = haversineMeters(gps, centroid);
    const avgRange =
      estimates.reduce((s, e) => s + (e.rangeM && e.rangeM > 0 ? e.rangeM : 500), 0) /
      Math.max(1, estimates.length);
    const tol = Math.max(2500, avgRange * 2.2);
    if (distanceMeters > tol) {
      mismatch = "strong";
      note = `GPS와 셀 DB 추정 중심 거리 ${Math.round(distanceMeters)}m (허용 대략 ${Math.round(tol)}m 초과)`;
    } else if (distanceMeters > Math.max(1200, avgRange * 1.2)) {
      mismatch = "soft";
      note = `GPS와 셀 DB 추정 중심 거리 ${Math.round(distanceMeters)}m (참고)`;
    } else {
      note = `GPS와 셀 DB 추정 중심 거리 ${Math.round(distanceMeters)}m (통상 범위)`;
    }
  } else if (!gps && centroid) {
    note = "GPS 없음 — 거리 비교 생략";
  } else if (gps && !centroid) {
    note = "DB에서 일치 셀 없음 — 거리 비교 생략";
  }

  base.serverOpencellidAnalysis = {
    skipped: false,
    source: "local_opencellid_pg",
    hitCount,
    lookupCount: lookups.length,
    centroid,
    distanceMeters,
    mismatch,
    note,
    lookups,
  };

  return base;
}
