#!/usr/bin/env node
/**
 * OpenCellID 셀 타워 CSV(또는 .csv.gz)를 PostgreSQL `opencellid_cells`에 적재합니다.
 *
 * 공식 덤프 컬럼(일반적):
 *   radio,mcc,net,lac,cell,unit,lon,lat,range,samples,changeable,created,updated,averageSignal
 *
 * 사용:
 *   DATABASE_URL=... node server/scripts/import-opencellid.mjs ./data/cell_towers.csv.gz
 *   DATABASE_URL=... node server/scripts/import-opencellid.mjs ./cells.csv --max-rows 500000
 *
 * 덤프 받기: https://opencellid.org/ 에서 API 키 발급 후 다운로드(약관 준수).
 */

import "dotenv/config";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 환경 변수가 필요합니다.");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const filePath = args[0];
if (!filePath) {
  console.error(
    "사용법: node server/scripts/import-opencellid.mjs <dump.csv|dump.csv.gz> [--truncate] [--max-rows N]"
  );
  process.exit(1);
}

const maxRows = (() => {
  const i = process.argv.indexOf("--max-rows");
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return Infinity;
})();

function parseCsvLine(line) {
  const parts = line.split(",");
  return parts.map((p) => p.trim());
}

function colIndex(header, name) {
  const i = header.findIndex(
    (h) => h.toLowerCase().replace(/"/g, "") === name.toLowerCase()
  );
  return i >= 0 ? i : -1;
}

function rowFromHeader(header, parts) {
  const idx = (names) => {
    for (const n of names) {
      const i = colIndex(header, n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iRadio = idx(["radio"]);
  const iMcc = idx(["mcc"]);
  const iMnc = idx(["net", "mnc"]);
  const iLac = idx(["lac", "tac", "area"]);
  const iCell = idx(["cell", "cellid", "cell_id"]);
  const iLon = idx(["lon", "longitude"]);
  const iLat = idx(["lat", "latitude"]);
  const iRange = idx(["range"]);
  const iSamples = idx(["samples"]);

  if (iRadio < 0 || iMcc < 0 || iMnc < 0 || iLac < 0 || iCell < 0 || iLon < 0 || iLat < 0) {
    return null;
  }

  const radio = String(parts[iRadio] ?? "")
    .replace(/"/g, "")
    .toUpperCase()
    .slice(0, 8);
  const mcc = parseInt(parts[iMcc], 10);
  const mnc = parseInt(parts[iMnc], 10);
  const area = parseInt(parts[iLac], 10);
  const cellRaw = String(parts[iCell] ?? "").replace(/"/g, "");
  const lon = parseFloat(parts[iLon]);
  const lat = parseFloat(parts[iLat]);
  const range_m =
    iRange >= 0 && parts[iRange] !== undefined
      ? parseInt(parts[iRange], 10)
      : null;
  const samples =
    iSamples >= 0 && parts[iSamples] !== undefined
      ? parseInt(parts[iSamples], 10)
      : null;

  if (!radio || Number.isNaN(mcc) || Number.isNaN(mnc) || Number.isNaN(area)) return null;
  if (!cellRaw) return null;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    radio,
    mcc,
    mnc,
    area,
    cell_id: cellRaw,
    lat,
    lon,
    range_m: Number.isNaN(range_m) ? null : range_m,
    samples: Number.isNaN(samples) ? null : samples,
  };
}

/** 헤더 없는 고정 순서(구 덤프) */
function rowFixed(parts) {
  if (parts.length < 9) return null;
  const radio = String(parts[0]).toUpperCase().slice(0, 8);
  const mcc = parseInt(parts[1], 10);
  const mnc = parseInt(parts[2], 10);
  const area = parseInt(parts[3], 10);
  const cell_id = String(parts[4] ?? "");
  const lon = parseFloat(parts[6]);
  const lat = parseFloat(parts[7]);
  const range_m = parseInt(parts[8], 10);
  const samples = parts[9] !== undefined ? parseInt(parts[9], 10) : null;
  if (!radio || Number.isNaN(mcc) || Number.isNaN(mnc) || Number.isNaN(area) || !cell_id)
    return null;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return {
    radio,
    mcc,
    mnc,
    area,
    cell_id,
    lat,
    lon,
    range_m: Number.isNaN(range_m) ? null : range_m,
    samples: Number.isNaN(samples) ? null : samples,
  };
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS opencellid_cells (
        radio VARCHAR(8) NOT NULL,
        mcc INTEGER NOT NULL,
        mnc INTEGER NOT NULL,
        area INTEGER NOT NULL,
        cell_id TEXT NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lon DOUBLE PRECISION NOT NULL,
        range_m INTEGER,
        samples INTEGER,
        PRIMARY KEY (radio, mcc, mnc, area, cell_id)
      )
    `);

    if (flags.has("--truncate")) {
      await client.query("TRUNCATE opencellid_cells");
      console.log("opencellid_cells TRUNCATE 완료");
    }

    const fileStream = createReadStream(filePath);
    const input =
      filePath.endsWith(".gz") || filePath.endsWith(".gzip")
        ? fileStream.pipe(createGunzip())
        : fileStream;

    const rl = createInterface({ input, crlfDelay: Infinity });

    let header = null;
    let lineNo = 0;
    let inserted = 0;
    let accepted = 0;
    let batch = [];
    const BATCH = 2500;

    async function flush() {
      if (batch.length === 0) return;
      const values = [];
      const params = [];
      let p = 1;
      for (const r of batch) {
        values.push(
          `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
        );
        params.push(
          r.radio,
          r.mcc,
          r.mnc,
          r.area,
          r.cell_id,
          r.lat,
          r.lon,
          r.range_m,
          r.samples
        );
      }
      await client.query(
        `
        INSERT INTO opencellid_cells (radio,mcc,mnc,area,cell_id,lat,lon,range_m,samples)
        VALUES ${values.join(",")}
        ON CONFLICT (radio,mcc,mnc,area,cell_id) DO UPDATE SET
          lat = EXCLUDED.lat,
          lon = EXCLUDED.lon,
          range_m = EXCLUDED.range_m,
          samples = EXCLUDED.samples
        `,
        params
      );
      inserted += batch.length;
      batch = [];
    }

    for await (const line of rl) {
      lineNo++;
      if (!line || line.startsWith("#")) continue;
      const parts = parseCsvLine(line);
      if (parts.length < 5) continue;

      if (!header) {
        const maybeHeader = parts[0].toLowerCase() === "radio";
        if (maybeHeader) {
          header = parts.map((h) => h.replace(/"/g, "").toLowerCase());
          continue;
        }
        header = [
          "radio",
          "mcc",
          "net",
          "lac",
          "cell",
          "unit",
          "lon",
          "lat",
          "range",
          "samples",
        ];
      }

      let row =
        header[0] === "radio"
          ? rowFromHeader(header, parts)
          : rowFixed(parts);

      if (!row) continue;
      batch.push(row);
      accepted++;

      if (batch.length >= BATCH) {
        await flush();
        process.stdout.write(`\r적재 ${inserted} 행…`);
      }

      if (accepted >= maxRows) {
        await flush();
        break;
      }
    }

    await flush();
    console.log(`\n완료: 약 ${inserted} 행 처리(중복은 UPSERT).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
