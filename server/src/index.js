import "dotenv/config";
import { initDatabase } from "./db.js";
import { createApp, processMinuteBatches } from "./app.js";

const app = createApp();
const port = Number(process.env.PORT || 4000);

initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Verity server listening on :${port}`);
    });
    setInterval(() => {
      void processMinuteBatches();
    }, 5_000);
  })
  .catch((error) => {
    console.error("DB 초기화 실패:", error);
    process.exit(1);
  });
