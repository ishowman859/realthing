import "dotenv/config";
import { initDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";

const app = createApp();
let dbReadyPromise = null;

async function ensureDatabaseReady() {
  // [각주1] 서버리스 환경에서 콜드스타트마다 스키마 초기화를 1회만 시도합니다.
  if (!dbReadyPromise) {
    dbReadyPromise = initDatabase();
  }
  return dbReadyPromise;
}

export default async function handler(req, res) {
  await ensureDatabaseReady();
  return app(req, res);
}

