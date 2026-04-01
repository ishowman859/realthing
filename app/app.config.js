/* eslint-disable @typescript-eslint/no-require-imports */
const { expo } = require("./app.json");

/**
 * EXPO_PUBLIC_VERITY_API_URL: 실제 폰에서 커스텀 API를 쓸 때 설정합니다.
 * 운영 빌드는 HTTPS 엔드포인트를 기본으로 두고, 로컬 Android 에뮬레이터만 localhost를 10.0.2.2로 치환합니다.
 */
module.exports = () => ({
  ...expo,
  extra: {
    ...expo.extra,
    verityApiUrl:
      process.env.EXPO_PUBLIC_VERITY_API_URL?.trim() ||
      "https://api.veritychains.com",
    verityOwnerAddress:
      process.env.EXPO_PUBLIC_VERITY_OWNER_ADDRESS?.trim() ||
      expo.extra?.verityOwnerAddress ||
      "",
  },
});
