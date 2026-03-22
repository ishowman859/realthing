/**
 * logo-mark.svg → Android mipmap webp (레거시 런처·폴백용) + Expo app/assets/icon.png
 * 실행: repo 루트에서 node server/scripts/generate-android-icons.mjs
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const svgPath = path.join(root, "logo-mark.svg");
const resDir = path.join(root, "app/android/app/src/main/res");
const expoIcon = path.join(root, "app/assets/icon.png");

const white = { r: 255, g: 255, b: 255, alpha: 1 };

const mipmapSizes = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

async function main() {
  await fs.promises.access(svgPath);

  for (const [folder, px] of Object.entries(mipmapSizes)) {
    const dir = path.join(resDir, folder);
    const webp = await sharp(svgPath)
      .resize(px, px, {
        fit: "contain",
        background: white,
        position: "center",
      })
      .webp({ quality: 95 })
      .toBuffer();

    await fs.promises.writeFile(path.join(dir, "ic_launcher.webp"), webp);
    await fs.promises.writeFile(path.join(dir, "ic_launcher_round.webp"), webp);
    // adaptive는 벡터 전경 사용; 구형 리소스 폴백용
    await fs.promises.writeFile(path.join(dir, "ic_launcher_foreground.webp"), webp);
  }

  await sharp(svgPath)
    .resize(1024, 1024, {
      fit: "contain",
      background: white,
      position: "center",
    })
    .png()
    .toFile(expoIcon);

  console.log("OK: mipmap webp + app/assets/icon.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
