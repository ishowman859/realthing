// Verity 검증 페이지 — API 연동 및 i18n
const __params = new URLSearchParams(window.location.search);
const __apiFromQuery = __params.get("api");
const __verityStaticPages =
  /\.github\.io$/i.test(window.location.hostname) ||
  document.querySelector('meta[name="verity-gh-pages"]')?.getAttribute("content") === "1";
const __host = window.location.hostname;
const API_BASE =
  window.__VERITY_API_BASE__ ||
  __apiFromQuery ||
  (__host === "localhost" || __host === "127.0.0.1"
    ? "http://localhost:4000"
    : __verityStaticPages
      ? ""
      : "/api");

const I18N = {
  ko: {
    htmlTitle: "Verity 검증 페이지",
    pageTitle: "Verity 검증 페이지",
    pageSub: "QR 또는 공유 URL로 접속한 자산의 원본성/유사성 검증 결과를 표시합니다.",
    tokenLabel: "Verity 토큰",
    serialLabel: "일련번호",
    modeLabel: "모드",
    createdAtLabel: "생성 시각",
    capturedAtLabel: "촬영 시각(기기)",
    onchainAtLabel: "온체인 시각",
    ownerLabel: "소유자",
    riskScoreLabel: "AI 1차 점수",
    hashInfoLabel: "해시 정보",
    originalFileLabel: "원본 파일",
    actionsLabel: "검증 액션",
    recheckButton: "서버 재검증 요청",
    assetAlt: "검증 자산 이미지",
    noImage: "표시할 이미지 URL이 없습니다.",
    loading: "조회 중...",
    fetchingVerification: "검증 정보 조회 중...",
    failedLoadVerification: "검증 데이터를 불러오지 못했습니다.",
    recheckFailed: "재검증 요청 실패",
    chainVerified: "체인 무결성 검증 완료",
    chainMismatch: "체인 검증 불일치",
    highSimilarity: "유사 이미지 높음 ({score}%)",
    warnSimilarity: "유사 이미지 주의 ({score}%)",
    lowSimilarity: "유사성 위험 낮음",
    noToken: "검증 토큰이 없습니다.",
    recheckError: "재검증 요청 중 오류",
    loadFail: "조회 실패",
    githubPagesNeedApi:
      "GitHub Pages에서는 API 주소가 필요합니다. URL에 ?api=https://백엔드주소 를 붙이세요.",
  },
  en: {
    htmlTitle: "Verity Verification",
    pageTitle: "Verity Verification",
    pageSub: "Displays authenticity/similarity verification results for assets opened via QR or shared URL.",
    tokenLabel: "Verity Token",
    serialLabel: "Serial",
    modeLabel: "Mode",
    createdAtLabel: "Created At",
    capturedAtLabel: "Captured At (Device)",
    onchainAtLabel: "On-chain Time",
    ownerLabel: "Owner",
    riskScoreLabel: "AI Risk Score",
    hashInfoLabel: "Hash Info",
    originalFileLabel: "Original File",
    actionsLabel: "Verification Actions",
    recheckButton: "Request Server Recheck",
    assetAlt: "Verification asset image",
    noImage: "No image URL available.",
    loading: "Loading...",
    fetchingVerification: "Loading verification data...",
    failedLoadVerification: "Failed to load verification data.",
    recheckFailed: "Failed to request recheck.",
    chainVerified: "On-chain integrity verified",
    chainMismatch: "On-chain verification mismatch",
    highSimilarity: "High image similarity ({score}%)",
    warnSimilarity: "Caution: similar image ({score}%)",
    lowSimilarity: "Low similarity risk",
    noToken: "Verification token is missing.",
    recheckError: "Error while requesting recheck",
    loadFail: "Failed to load",
    githubPagesNeedApi:
      "On GitHub Pages, set the API URL: add ?api=https://your-api-host to the URL.",
  },
  ja: {
    htmlTitle: "Verity 検証ページ",
    pageTitle: "Verity 検証ページ",
    pageSub: "QR または共有 URL で開いたアセットの真正性/類似性の検証結果を表示します。",
    tokenLabel: "Verity トークン",
    serialLabel: "シリアル番号",
    modeLabel: "モード",
    createdAtLabel: "作成時刻",
    capturedAtLabel: "撮影時刻 (端末)",
    onchainAtLabel: "オンチェーン時刻",
    ownerLabel: "所有者",
    riskScoreLabel: "AI 一次スコア",
    hashInfoLabel: "ハッシュ情報",
    originalFileLabel: "原本ファイル",
    actionsLabel: "検証アクション",
    recheckButton: "サーバー再検証をリクエスト",
    assetAlt: "検証対象画像",
    noImage: "表示できる画像 URL がありません。",
    loading: "読み込み中...",
    fetchingVerification: "検証情報を取得中...",
    failedLoadVerification: "検証データの取得に失敗しました。",
    recheckFailed: "再検証リクエストに失敗しました。",
    chainVerified: "チェーン整合性の検証完了",
    chainMismatch: "チェーン検証の不一致",
    highSimilarity: "画像の類似度が高い ({score}%)",
    warnSimilarity: "画像の類似に注意 ({score}%)",
    lowSimilarity: "類似リスクが低い",
    noToken: "検証トークンがありません。",
    recheckError: "再検証リクエスト中にエラー",
    loadFail: "取得失敗",
    githubPagesNeedApi:
      "GitHub Pages では API の URL が必要です。?api=https://バックエンド を付けてください。",
  },
  zh: {
    htmlTitle: "Verity 验证页面",
    pageTitle: "Verity 验证页面",
    pageSub: "显示通过二维码或分享链接访问的资产真伪/相似性验证结果。",
    tokenLabel: "Verity 令牌",
    serialLabel: "序列号",
    modeLabel: "模式",
    createdAtLabel: "创建时间",
    capturedAtLabel: "拍摄时间（设备）",
    onchainAtLabel: "链上时间",
    ownerLabel: "所有者",
    riskScoreLabel: "AI 风险分数",
    hashInfoLabel: "哈希信息",
    originalFileLabel: "原始文件",
    actionsLabel: "验证操作",
    recheckButton: "请求服务器重新验证",
    assetAlt: "验证资产图片",
    noImage: "没有可显示的图片 URL。",
    loading: "加载中...",
    fetchingVerification: "正在加载验证数据...",
    failedLoadVerification: "无法加载验证数据。",
    recheckFailed: "重新验证请求失败。",
    chainVerified: "链上完整性验证通过",
    chainMismatch: "链上验证不一致",
    highSimilarity: "图像相似度高 ({score}%)",
    warnSimilarity: "注意：图像相似 ({score}%)",
    lowSimilarity: "相似风险较低",
    noToken: "缺少验证令牌。",
    recheckError: "请求重新验证时出错",
    loadFail: "加载失败",
    githubPagesNeedApi:
      "在 GitHub Pages 上需要提供 API 地址：请在 URL 加上 ?api=https://你的后端",
  },
};

function detectLanguage() {
  const params = new URLSearchParams(window.location.search);
  const forced = (params.get("lang") || "").toLowerCase();
  if (forced === "ko" || forced === "en" || forced === "ja" || forced === "zh") {
    return forced;
  }
  const browserLang = (navigator.language || "en").toLowerCase();
  if (browserLang.startsWith("ko")) return "ko";
  if (browserLang.startsWith("ja")) return "ja";
  if (browserLang.startsWith("zh")) return "zh";
  return "en";
}

const ACTIVE_LANG = detectLanguage();
const DATE_LOCALE_MAP = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" };
const DATE_LOCALE = DATE_LOCALE_MAP[ACTIVE_LANG] || "en-US";

const alerts = {
  ko: "모니터를 촬영한 것으로 의심되는 이미지는 인증이 제한될 수 있습니다.",
  en: "Images suspected of being taken from a monitor may be restricted.",
  ja: "モニターを撮影したと思われる画像は認証が制限される場合があります。",
  zh: "疑似拍摄自显示器的图像可能会受到认证限制。",
};

function t(key, vars = {}) {
  const dict = I18N[ACTIVE_LANG] || I18N.en;
  const fallback = I18N.en;
  let text = dict[key] ?? fallback[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

const el = {
  titleText: document.getElementById("titleText"),
  subText: document.getElementById("subText"),
  labelToken: document.getElementById("labelToken"),
  labelSerial: document.getElementById("labelSerial"),
  labelMode: document.getElementById("labelMode"),
  labelCreatedAt: document.getElementById("labelCreatedAt"),
  labelCapturedAt: document.getElementById("labelCapturedAt"),
  labelOnchainAt: document.getElementById("labelOnchainAt"),
  labelOwner: document.getElementById("labelOwner"),
  labelRiskScore: document.getElementById("labelRiskScore"),
  labelHashInfo: document.getElementById("labelHashInfo"),
  labelOriginalFile: document.getElementById("labelOriginalFile"),
  labelActions: document.getElementById("labelActions"),
  tokenText: document.getElementById("tokenText"),
  statusBadge: document.getElementById("statusBadge"),
  mode: document.getElementById("mode"),
  createdAt: document.getElementById("createdAt"),
  capturedAt: document.getElementById("capturedAt"),
  onchainAt: document.getElementById("onchainAt"),
  owner: document.getElementById("owner"),
  serial: document.getElementById("serial"),
  riskScore: document.getElementById("riskScore"),
  monitorAlert: document.getElementById("monitorAlert"),
  sha256: document.getElementById("sha256"),
  phash: document.getElementById("phash"),
  assetImage: document.getElementById("assetImage"),
  assetEmpty: document.getElementById("assetEmpty"),
  recheckButton: document.getElementById("recheckButton"),
};

function applyStaticI18n() {
  document.documentElement.lang = ACTIVE_LANG;
  document.title = t("htmlTitle");
  setText(el.titleText, t("pageTitle"));
  setText(el.subText, t("pageSub"));
  setText(el.labelToken, t("tokenLabel"));
  setText(el.labelSerial, t("serialLabel"));
  setText(el.labelMode, t("modeLabel"));
  setText(el.labelCreatedAt, t("createdAtLabel"));
  setText(el.labelCapturedAt, t("capturedAtLabel"));
  setText(el.labelOnchainAt, t("onchainAtLabel"));
  setText(el.labelOwner, t("ownerLabel"));
  setText(el.labelRiskScore, t("riskScoreLabel"));
  setText(el.labelHashInfo, t("hashInfoLabel"));
  setText(el.labelOriginalFile, t("originalFileLabel"));
  setText(el.labelActions, t("actionsLabel"));
  setText(el.recheckButton, t("recheckButton"));
  setText(el.assetEmpty, t("noImage"));
  el.assetImage.alt = t("assetAlt");
  setStatus("warn", t("loading"));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(DATE_LOCALE);
}

function updateMonitorAlert(data) {
  const risk = typeof data.aiRiskScore === "number" ? data.aiRiskScore : null;
  const isMonitorSuspected = risk !== null && risk >= 35;
  if (!isMonitorSuspected) {
    el.monitorAlert.style.display = "none";
    el.monitorAlert.textContent = "";
    return;
  }
  const lang = alerts[ACTIVE_LANG] ? ACTIVE_LANG : "en";
  el.monitorAlert.textContent = alerts[lang];
  el.monitorAlert.style.display = "block";
}

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("id");
  if (fromQuery) return fromQuery;

  const chunks = window.location.pathname.split("/").filter(Boolean);
  const vIndex = chunks.indexOf("v");
  if (vIndex >= 0 && chunks[vIndex + 1]) return chunks[vIndex + 1];
  if (chunks.length > 0) return chunks[chunks.length - 1];
  return "";
}

function setStatus(type, text) {
  el.statusBadge.className = `status ${type}`;
  el.statusBadge.textContent = text;
}

function setText(node, value) {
  node.textContent = value && String(value).trim() ? String(value) : "-";
}

async function loadVerification(token) {
  setStatus("warn", t("fetchingVerification"));
  const res = await fetch(`${API_BASE}/v1/verify/${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(t("failedLoadVerification"));
  return res.json();
}

async function triggerRecheck(token) {
  const res = await fetch(
    `${API_BASE}/v1/verify/${encodeURIComponent(token)}/recheck`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(t("recheckFailed"));
  return res.json();
}

function render(data) {
  setText(el.mode, (data.mode || "-").toUpperCase());
  setText(el.serial, data.serial || "-");
  setText(el.createdAt, data.createdAt ? formatDateTime(data.createdAt) : "-");
  setText(
    el.capturedAt,
    data.capturedTimestampMs ? formatDateTime(Number(data.capturedTimestampMs)) : "-"
  );
  setText(
    el.onchainAt,
    data.onchainTimestampMs ? formatDateTime(Number(data.onchainTimestampMs)) : "-"
  );
  setText(el.owner, data.owner || "-");
  setText(el.riskScore, typeof data.aiRiskScore === "number" ? `${data.aiRiskScore} / 100` : "-");
  setText(el.sha256, data.sha256 || "-");
  setText(el.phash, data.phash || "-");
  updateMonitorAlert(data);

  if (data.assetUrl) {
    el.assetImage.src = data.assetUrl;
    el.assetImage.style.display = "block";
    el.assetEmpty.style.display = "none";
  } else {
    el.assetImage.style.display = "none";
    el.assetEmpty.style.display = "block";
  }

  if (data.mode === "sha256") {
    const ok = !!data.chainVerified;
    setStatus(ok ? "ok" : "bad", ok ? t("chainVerified") : t("chainMismatch"));
  } else {
    const dup = typeof data.duplicateScore === "number" ? data.duplicateScore : null;
    if (dup !== null && dup >= 95) setStatus("bad", t("highSimilarity", { score: dup }));
    else if (dup !== null && dup >= 85) setStatus("warn", t("warnSimilarity", { score: dup }));
    else setStatus("ok", t("lowSimilarity"));
  }
}

async function main() {
  applyStaticI18n();
  const token = getTokenFromUrl();
  setText(el.tokenText, token || "-");
  if (!API_BASE) {
    setStatus("bad", __verityStaticPages ? t("githubPagesNeedApi") : t("loadFail"));
    return;
  }
  if (!token) {
    setStatus("bad", t("noToken"));
    return;
  }

  el.recheckButton.addEventListener("click", async () => {
    try {
      el.recheckButton.disabled = true;
      await triggerRecheck(token);
      const fresh = await loadVerification(token);
      render(fresh);
    } catch (err) {
      alert(err.message || t("recheckError"));
    } finally {
      el.recheckButton.disabled = false;
    }
  });

  try {
    const data = await loadVerification(token);
    render(data);
  } catch (err) {
    setStatus("bad", err.message || t("loadFail"));
  }
}

main();
