/* eslint-disable @typescript-eslint/no-require-imports */
const { expo } = require("./app.json");

/**
 * EXPO_PUBLIC_VERITY_API_URL: 실제 폰에서 PC API(예: http://192.168.0.12:4000) 쓸 때 설정.
 * 에뮬레이터는 verityApi.ts가 localhost → 10.0.2.2 로 치환합니다.
 */
module.exports = () => ({
  ...expo,
  android: {
    ...expo.android,
    usesCleartextTraffic: true,
  },
  extra: {
    ...expo.extra,
    verityApiUrl:
      process.env.EXPO_PUBLIC_VERITY_API_URL?.trim() ||
      expo.extra?.verityApiUrl ||
      "http://98.84.127.220:4000",
    verityOwnerAddress:
      process.env.EXPO_PUBLIC_VERITY_OWNER_ADDRESS?.trim() ||
      expo.extra?.verityOwnerAddress ||
      "",
  },
});
