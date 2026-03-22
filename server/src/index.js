import "dotenv/config";
import { initDatabase } from "./db.js";
import { createApp, processMinuteBatches } from "./app.js";

const app = createApp();
const port = Number(process.env.PORT || 4000);

initDatabase()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Verity server listening on 0.0.0.0:${port}`);
    });
    setInterval(() => {
      void processMinuteBatches();
    }, 5_000);
  })
  .catch((error) => {
    console.error("DB 초기화 실패:", error);
    process.exit(1);
  });
