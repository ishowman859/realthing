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
    verificationEyebrow: "검증",
    pageTitle: "Verity 검증 페이지",
    pageSub: "QR 또는 공유 URL로 접속한 자산의 원본성/유사성 검증 결과를 표시합니다.",
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
    noToken: "공유 링크가 없거나 잘못되었습니다. 파일을 업로드하거나 올바른 링크로 접속하세요.",
    recheckError: "재검증 요청 중 오류",
    loadFail: "조회 실패",
    githubPagesNeedApi:
      "GitHub Pages에서는 API 주소가 필요합니다. URL에 ?api=https://백엔드주소 를 붙이세요.",
    uploadSectionLabel: "미디어 업로드",
    uploadHelp:
      "사진 또는 동영상을 올리면 서버가 해시를 계산하고 등록한 뒤 아래에 검증 결과를 표시합니다.",
    uploadButtonLabel: "업로드 및 등록",
    ownerOptionalPlaceholder: "owner (선택, 비우면 웹 게스트)",
    uploadWorking: "업로드 및 서버 처리 중…",
    uploadOk: "등록 완료. 아래 검증 결과를 확인하세요.",
    uploadFail: "업로드 실패",
    uploadNeedFile: "파일을 선택하세요.",
    uploadOrTokenHint: "파일을 업로드하거나 공유 링크로 접속하면 결과가 표시됩니다.",
    merkleSectionLabel: "머클 경로 검증",
    merkleIntro:
      "클라우드(AWS 등)는 **머클 트리 통째로** 주지 않습니다. 이 사진이 공개된 **머클 루트**에 닿는지 확인하는 데 필요한 **이웃 해시 {count}개**(머클 경로)만 떼어 줍니다. **서버를 믿지 말고** 아래 조각을 브라우저에서 직접 이어 붙여 루트가 맞는지 확인하세요.",
    merklePending:
      "아직 이 자산이 배치에 머클 봉인되지 않아 경로가 없습니다. 잠시 후 다시 열거나 「서버 재검증」을 눌러 보세요.",
    merkleProofSummary: "이웃 해시 목록 (경로 조각)",
    labelMerkleRootPub: "공개 머클 루트",
    labelMerkleLeafSer: "리프 해시 (직렬화)",
    labelMerklePathLen: "이웃 해시 개수 (경로 길이)",
    merkleVerifyBtn: "이 브라우저에서 머클 경로 검증",
    merkleVerifyOk:
      "일치합니다. 브라우저에서 계산한 루트가 공개 머클 루트와 같습니다. 트리 전체 없이 **경로만**으로 연결을 확인한 것입니다.",
    merkleVerifyFail: "불일치합니다. 경로·루트·리프 중 어느 하나가 맞지 않거나 데이터가 바뀌었을 수 있습니다.",
    merkleVerifyNeedCrypto: "HTTPS(또는 localhost)에서만 Web Crypto로 검증할 수 있습니다.",
    merkleLeafMismatch:
      "경고: 브라우저가 직렬화 리프를 다시 계산한 값과 서버가 준 merkleLeafHash가 다릅니다.",
    merkleLeafOk: "직렬화 리프 재계산이 서버 merkleLeafHash와 일치합니다.",
    merkleLegacyNoAssetId:
      "응답에 assetId가 없어 리프를 재계산할 수 없습니다. 서버가 준 리프 해시로만 경로를 검증합니다.",
    merkleLocalLabel: "원본 파일과 대조 (SHA-256)",
    merkleCompareBtn: "로컬 파일 SHA-256 비교",
    merkleCompareOk: "로컬 파일의 SHA-256이 서버 기록과 동일합니다.",
    merkleCompareFail: "로컬 파일 내용이 서버에 등록된 시점의 바이트와 다릅니다.",
    merkleCompareWrongMode: "pHash 모드에서는 파일 SHA-256 대조를 쓰지 않습니다.",
    merkleNoFile: "파일을 먼저 선택하세요.",
    merkleNoDataYet: "파일을 업로드하거나 공유 링크로 조회하면 이웃 해시(머클 경로)가 여기 표시됩니다.",
  },
  en: {
    htmlTitle: "Verity Verification",
    verificationEyebrow: "Verification",
    pageTitle: "Verity Verification",
    pageSub: "Displays authenticity/similarity verification results for assets opened via QR or shared URL.",
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
    noToken: "No valid share link. Upload a file or open the correct link.",
    recheckError: "Error while requesting recheck",
    loadFail: "Failed to load",
    githubPagesNeedApi:
      "On GitHub Pages, set the API URL: add ?api=https://your-api-host to the URL.",
    uploadSectionLabel: "Upload media",
    uploadHelp:
      "Upload a photo or video: the server computes hashes, registers the asset, and shows verification below.",
    uploadButtonLabel: "Upload & register",
    ownerOptionalPlaceholder: "owner (optional)",
    uploadWorking: "Uploading…",
    uploadOk: "Registered. See verification below.",
    uploadFail: "Upload failed",
    uploadNeedFile: "Choose a file first.",
    uploadOrTokenHint: "Upload a file or open a shared link to see results.",
    merkleSectionLabel: "Merkle path verification",
    merkleIntro:
      "The cloud does **not** send the whole Merkle tree. It only returns the **{count} sibling hashes** (the Merkle path) needed to connect your photo’s leaf to the published **Merkle root**. **Don’t trust the server**—in your browser, stitch those pieces yourself and check the root matches.",
    merklePending:
      "No Merkle path yet (batch not sealed). Try again later or press “Request Server Recheck”.",
    merkleProofSummary: "Sibling hashes (path)",
    labelMerkleRootPub: "Published Merkle root",
    labelMerkleLeafSer: "Leaf hash (serialized)",
    labelMerklePathLen: "Sibling count (path length)",
    merkleVerifyBtn: "Verify path in this browser",
    merkleVerifyOk:
      "Match: the root computed here equals the published Merkle root. You verified the link using **only the path**, not the full tree.",
    merkleVerifyFail: "Mismatch: path, root, or leaf data may be wrong or changed.",
    merkleVerifyNeedCrypto: "Web Crypto verification needs HTTPS or localhost.",
    merkleLeafMismatch: "Warning: recomputed leaf ≠ server merkleLeafHash.",
    merkleLeafOk: "Recomputed leaf matches server merkleLeafHash.",
    merkleLegacyNoAssetId:
      "No assetId in response; recomputing the leaf isn’t possible. Verifying with the server-provided leaf hash only.",
    merkleLocalLabel: "Compare original file (SHA-256)",
    merkleCompareBtn: "Compare local file SHA-256",
    merkleCompareOk: "Local file SHA-256 matches the server record.",
    merkleCompareFail: "Local file bytes differ from what was registered.",
    merkleCompareWrongMode: "File SHA-256 compare is for SHA-256 mode only.",
    merkleNoFile: "Choose a file first.",
    merkleNoDataYet: "Upload a file or open a shared link to load the sibling hashes (Merkle path) here.",
  },
  ja: {
    htmlTitle: "Verity 検証ページ",
    verificationEyebrow: "検証",
    pageTitle: "Verity 検証ページ",
    pageSub: "QR または共有 URL で開いたアセットの真正性/類似性の検証結果を表示します。",
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
    noToken: "共有リンクがないか無効です。ファイルをアップロードするか正しいリンクを開いてください。",
    recheckError: "再検証リクエスト中にエラー",
    loadFail: "取得失敗",
    githubPagesNeedApi:
      "GitHub Pages では API の URL が必要です。?api=https://バックエンド を付けてください。",
    uploadSectionLabel: "メディアアップロード",
    uploadHelp: "写真または動画を送ると、サーバーがハッシュを計算して登録し、下に検証結果を表示します。",
    uploadButtonLabel: "アップロードして登録",
    ownerOptionalPlaceholder: "owner（任意）",
    uploadWorking: "アップロード処理中…",
    uploadOk: "登録完了。下の結果を確認してください。",
    uploadFail: "アップロード失敗",
    uploadNeedFile: "ファイルを選んでください。",
    uploadOrTokenHint: "ファイルをアップロードするか共有リンクで開くと結果が表示されます。",
    merkleSectionLabel: "マークルパス検証",
    merkleIntro:
      "クラウドはマークル木全体ではなく、この写真のリーフを公開**マークルルート**につなぐのに必要な**隣接ハッシュ {count}個**（パス）だけを返します。**サーバーを信じず**、ブラウザでパズルのように繋いでルートが一致するか確かめてください。",
    merklePending: "まだバッチが封切られておらずパスがありません。しばらくして再読み込みするか再検証してください。",
    merkleProofSummary: "隣接ハッシュ一覧（パス）",
    labelMerkleRootPub: "公開マークルルート",
    labelMerkleLeafSer: "リーフハッシュ（直列化）",
    labelMerklePathLen: "隣接ハッシュ数（パス長）",
    merkleVerifyBtn: "このブラウザでパスを検証",
    merkleVerifyOk: "一致: 計算したルートが公開ルートと同じです。木全体なしでパスのみで確認しました。",
    merkleVerifyFail: "不一致: パス・ルート・リーフのいずれかが合いません。",
    merkleVerifyNeedCrypto: "Web Crypto には HTTPS または localhost が必要です。",
    merkleLeafMismatch: "注意: 再計算リーフとサーバの merkleLeafHash が異なります。",
    merkleLeafOk: "再計算リーフがサーバ merkleLeafHash と一致しました。",
    merkleLegacyNoAssetId: "assetId がないためリーフ再計算はできません。サーバのリーフで検証します。",
    merkleLocalLabel: "原ファイル照合（SHA-256）",
    merkleCompareBtn: "ローカルファイルの SHA-256 を比較",
    merkleCompareOk: "ローカルファイルの SHA-256 がサーバ記録と一致しました。",
    merkleCompareFail: "ローカルファイルが登録時のバイト列と異なります。",
    merkleCompareWrongMode: "pHash モードではファイル SHA-256 照合はありません。",
    merkleNoFile: "先にファイルを選んでください。",
    merkleNoDataYet: "ファイルをアップロードするか共有リンクで開くと、隣接ハッシュ（マークルパス）が表示されます。",
  },
  zh: {
    htmlTitle: "Verity 验证页面",
    verificationEyebrow: "验证",
    pageTitle: "Verity 验证页面",
    pageSub: "显示通过二维码或分享链接访问的资产真伪/相似性验证结果。",
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
    noToken: "没有有效的分享链接。请上传文件或使用正确链接打开。",
    recheckError: "请求重新验证时出错",
    loadFail: "加载失败",
    githubPagesNeedApi:
      "在 GitHub Pages 上需要提供 API 地址：请在 URL 加上 ?api=https://你的后端",
    uploadSectionLabel: "上传媒体",
    uploadHelp: "上传照片或视频后，服务器会计算哈希并注册，在下方显示验证结果。",
    uploadButtonLabel: "上传并登记",
    ownerOptionalPlaceholder: "owner（可选）",
    uploadWorking: "正在上传…",
    uploadOk: "已登记。请查看下方验证结果。",
    uploadFail: "上传失败",
    uploadNeedFile: "请先选择文件。",
    uploadOrTokenHint: "上传文件或通过分享链接打开即可查看结果。",
    merkleSectionLabel: "默克尔路径验证",
    merkleIntro:
      "云不会下发整棵默克尔树，只会给出把此照片叶子连到公开**默克尔根**所需的 **{count} 个邻接哈希**（路径）。请**不要盲信服务器**，在浏览器里自己拼出根是否一致。",
    merklePending: "批次尚未封存，暂无路径。请稍后刷新或点击「请求服务器重新验证」。",
    merkleProofSummary: "邻接哈希列表（路径片段）",
    labelMerkleRootPub: "公开默克尔根",
    labelMerkleLeafSer: "叶子哈希（序列化）",
    labelMerklePathLen: "邻接哈希数量（路径长度）",
    merkleVerifyBtn: "在此浏览器验证路径",
    merkleVerifyOk: "一致：本地算出的根与公开默克尔根相同，仅用路径、无需整棵树即可完成核对。",
    merkleVerifyFail: "不一致：路径、根或叶子数据可能错误或已变更。",
    merkleVerifyNeedCrypto: "Web Crypto 需要 HTTPS 或 localhost。",
    merkleLeafMismatch: "警告：重算的叶子与服务器 merkleLeafHash 不一致。",
    merkleLeafOk: "重算叶子与服务器 merkleLeafHash 一致。",
    merkleLegacyNoAssetId: "响应无 assetId，无法重算叶子，仅用服务器提供的叶子哈希验证路径。",
    merkleLocalLabel: "与原文件对照（SHA-256）",
    merkleCompareBtn: "比较本地文件 SHA-256",
    merkleCompareOk: "本地文件 SHA-256 与服务器记录一致。",
    merkleCompareFail: "本地文件与登记时的字节不一致。",
    merkleCompareWrongMode: "仅 SHA-256 模式支持文件 SHA-256 对照。",
    merkleNoFile: "请先选择文件。",
    merkleNoDataYet: "上传文件或通过分享链接查询后，将在此显示邻接哈希（默克尔路径）。",
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

/** 서버 `src/merkle.js` 와 동일한 직렬화·페어 해시·경로 검증 */
async function sha256HexUtf8(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256HexBuffer(buffer) {
  const buf = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createClientLeafHash(v) {
  const mode = String(v.mode || "");
  const hashValue = String(v.sha256 || v.phash || "");
  const serial = String(v.serial || "");
  const id = String(v.assetId ?? "");
  const payload = `${mode}|${hashValue}|${serial}|${id}`;
  return sha256HexUtf8(payload);
}

async function verifyMerkleProofClient(leafHash, proof, expectedRoot) {
  if (!leafHash || !Array.isArray(proof) || !expectedRoot) return false;
  let current = leafHash;
  for (const node of proof) {
    const sibling = String(node?.hash || "");
    const position = String(node?.position || "");
    if (!sibling || (position !== "left" && position !== "right")) return false;
    const pair = position === "left" ? `${sibling}${current}` : `${current}${sibling}`;
    current = await sha256HexUtf8(pair);
  }
  return current === expectedRoot;
}

function setMerkleIntroParagraph(elP, text) {
  if (!elP) return;
  elP.textContent = "";
  const parts = String(text).split(/\*\*/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const s = document.createElement("strong");
      s.textContent = part;
      elP.appendChild(s);
    } else if (part) {
      elP.appendChild(document.createTextNode(part));
    }
  });
}

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

let sessionToken = "";
let lastPreviewUrl = null;

/** 버튼 연타·서버 1초 가드와 맞춤: 동작 종료 후에도 최소 1초 간격 */
const BTN_COOLDOWN_MS = 1000;

function scheduleReenableButton(button, startedAt) {
  if (!button) return;
  const elapsed = Date.now() - startedAt;
  const wait = Math.max(0, BTN_COOLDOWN_MS - elapsed);
  window.setTimeout(() => {
    button.disabled = false;
  }, wait);
}

const el = {
  titleText: document.getElementById("titleText"),
  subText: document.getElementById("subText"),
  labelUpload: document.getElementById("labelUpload"),
  uploadHelp: document.getElementById("uploadHelp"),
  uploadButton: document.getElementById("uploadButton"),
  uploadStatus: document.getElementById("uploadStatus"),
  fileInput: document.getElementById("fileInput"),
  ownerInput: document.getElementById("ownerInput"),
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
  merkleCard: document.getElementById("merkleCard"),
  merkleIntro: document.getElementById("merkleIntro"),
  merklePending: document.getElementById("merklePending"),
  merkleActive: document.getElementById("merkleActive"),
  merkleRootVal: document.getElementById("merkleRootVal"),
  merkleLeafVal: document.getElementById("merkleLeafVal"),
  merklePathLen: document.getElementById("merklePathLen"),
  merkleProofList: document.getElementById("merkleProofList"),
  merkleProofSummary: document.getElementById("merkleProofSummary"),
  merkleVerifyBtn: document.getElementById("merkleVerifyBtn"),
  merkleVerifyResult: document.getElementById("merkleVerifyResult"),
  merkleLocalWrap: document.getElementById("merkleLocalWrap"),
  merkleLocalFile: document.getElementById("merkleLocalFile"),
  merkleCompareBtn: document.getElementById("merkleCompareBtn"),
  merkleCompareResult: document.getElementById("merkleCompareResult"),
  labelMerkleSection: document.getElementById("labelMerkleSection"),
  labelMerkleRoot: document.getElementById("labelMerkleRoot"),
  labelMerkleLeaf: document.getElementById("labelMerkleLeaf"),
  labelMerklePathLen: document.getElementById("labelMerklePathLen"),
  labelMerkleLocal: document.getElementById("labelMerkleLocal"),
};

let lastVerificationPayload = null;

function initBranding() {
  const img = document.getElementById("brandLogo");
  const fallback = document.getElementById("brandFallback");
  const custom = __params.get("logo");
  if (img) {
    if (custom) {
      img.src = custom;
      img.classList.add("brand-logo--raster");
    }
    if (fallback) {
      img.addEventListener("error", () => {
        img.classList.add("is-hidden");
        const wrap = img.closest(".brand-mark-wrap");
        if (wrap) wrap.hidden = true;
        fallback.hidden = false;
      });
    }
  }
}

function applyStaticI18n() {
  document.documentElement.lang = ACTIVE_LANG;
  document.title = t("htmlTitle");
  const eyebrow = document.getElementById("headerEyebrow");
  if (eyebrow) eyebrow.textContent = t("verificationEyebrow");
  setText(el.titleText, t("pageTitle"));
  setText(el.subText, t("pageSub"));
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
  if (el.labelUpload) setText(el.labelUpload, t("uploadSectionLabel"));
  if (el.uploadHelp) el.uploadHelp.textContent = t("uploadHelp");
  if (el.uploadButton) setText(el.uploadButton, t("uploadButtonLabel"));
  if (el.ownerInput) el.ownerInput.placeholder = t("ownerOptionalPlaceholder");
  setStatus("warn", t("loading"));
  if (el.labelMerkleSection) setText(el.labelMerkleSection, t("merkleSectionLabel"));
  if (el.labelMerkleRoot) setText(el.labelMerkleRoot, t("labelMerkleRootPub"));
  if (el.labelMerkleLeaf) setText(el.labelMerkleLeaf, t("labelMerkleLeafSer"));
  if (el.labelMerklePathLen) setText(el.labelMerklePathLen, t("labelMerklePathLen"));
  if (el.merkleProofSummary) el.merkleProofSummary.textContent = t("merkleProofSummary");
  if (el.merkleVerifyBtn) el.merkleVerifyBtn.textContent = t("merkleVerifyBtn");
  if (el.merkleCompareBtn) el.merkleCompareBtn.textContent = t("merkleCompareBtn");
  if (el.labelMerkleLocal) setText(el.labelMerkleLocal, t("merkleLocalLabel"));
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
  if (!node) return;
  node.textContent = value && String(value).trim() ? String(value) : "-";
}

function renderMerkleStub() {
  if (!el.merkleCard || !el.merkleIntro) return;
  lastVerificationPayload = null;
  setMerkleIntroParagraph(el.merkleIntro, t("merkleIntro", { count: "—" }));
  if (el.merkleVerifyResult) {
    el.merkleVerifyResult.textContent = "";
    el.merkleVerifyResult.className = "merkle-verify-result";
  }
  if (el.merkleCompareResult) {
    el.merkleCompareResult.textContent = "";
    el.merkleCompareResult.className = "merkle-verify-result";
  }
  if (el.merklePending) {
    el.merklePending.hidden = false;
    el.merklePending.textContent = t("merkleNoDataYet");
  }
  if (el.merkleActive) el.merkleActive.hidden = true;
  if (el.merkleVerifyBtn) el.merkleVerifyBtn.disabled = true;
}

function renderMerkle(data) {
  if (!el.merkleCard || !el.merkleIntro) return;
  lastVerificationPayload = data;

  const proof = Array.isArray(data.merkleProof) ? data.merkleProof : null;
  const hasPath = !!(proof && proof.length > 0 && data.merkleRoot);

  setMerkleIntroParagraph(
    el.merkleIntro,
    t("merkleIntro", { count: hasPath ? String(proof.length) : "0" })
  );

  if (el.merkleVerifyResult) {
    el.merkleVerifyResult.textContent = "";
    el.merkleVerifyResult.className = "merkle-verify-result";
  }
  if (el.merkleCompareResult) {
    el.merkleCompareResult.textContent = "";
    el.merkleCompareResult.className = "merkle-verify-result";
  }

  if (!hasPath) {
    if (el.merklePending) {
      el.merklePending.hidden = false;
      el.merklePending.textContent = t("merklePending");
    }
    if (el.merkleActive) el.merkleActive.hidden = true;
    if (el.merkleVerifyBtn) el.merkleVerifyBtn.disabled = true;
    return;
  }

  if (el.merklePending) el.merklePending.hidden = true;
  if (el.merkleActive) el.merkleActive.hidden = false;
  if (el.merkleVerifyBtn) el.merkleVerifyBtn.disabled = false;

  setText(el.merkleRootVal, data.merkleRoot);
  setText(el.merkleLeafVal, data.merkleLeafHash || "-");
  setText(el.merklePathLen, String(proof.length));

  if (el.merkleProofList) {
    el.merkleProofList.replaceChildren();
    proof.forEach((node, i) => {
      const li = document.createElement("li");
      const pos = String(node.position || "?");
      const hash = String(node.hash || "");
      li.textContent = `${i + 1}. ${pos}: ${hash}`;
      el.merkleProofList.appendChild(li);
    });
  }

  if (el.merkleLocalWrap) {
    el.merkleLocalWrap.style.display = data.mode === "sha256" ? "block" : "none";
  }
}

function bindMerkle() {
  if (!el.merkleVerifyBtn) return;
  el.merkleVerifyBtn.addEventListener("click", async () => {
    const data = lastVerificationPayload;
    if (!el.merkleVerifyResult) return;
    el.merkleVerifyResult.className = "merkle-verify-result";
    const proof = data?.merkleProof;
    const root = data?.merkleRoot;
    if (!data || !Array.isArray(proof) || !proof.length || !root) return;
    if (!window.isSecureContext || !window.crypto?.subtle) {
      el.merkleVerifyResult.textContent = t("merkleVerifyNeedCrypto");
      el.merkleVerifyResult.classList.add("is-bad");
      return;
    }

    const lines = [];
    let pathLeaf = data.merkleLeafHash;

    if (data.assetId) {
      const recomputed = await createClientLeafHash(data);
      if (data.merkleLeafHash) {
        if (recomputed === data.merkleLeafHash) {
          lines.push(t("merkleLeafOk"));
          pathLeaf = recomputed;
        } else {
          lines.push(t("merkleLeafMismatch"));
          pathLeaf = data.merkleLeafHash;
        }
      } else {
        pathLeaf = recomputed;
      }
    } else {
      lines.push(t("merkleLegacyNoAssetId"));
    }

    if (!pathLeaf) {
      el.merkleVerifyResult.textContent = lines.join(" ") + " " + t("merkleVerifyFail");
      el.merkleVerifyResult.classList.add("is-bad");
      return;
    }

    const pathOk = await verifyMerkleProofClient(pathLeaf, proof, root);
    lines.push(pathOk ? t("merkleVerifyOk") : t("merkleVerifyFail"));
    el.merkleVerifyResult.textContent = lines.join(" ");
    el.merkleVerifyResult.classList.add(pathOk ? "is-ok" : "is-bad");
  });

  if (el.merkleCompareBtn) {
    el.merkleCompareBtn.addEventListener("click", async () => {
      const data = lastVerificationPayload;
      if (!el.merkleCompareResult) return;
      el.merkleCompareResult.className = "merkle-verify-result";
      if (!data || data.mode !== "sha256") {
        el.merkleCompareResult.textContent = t("merkleCompareWrongMode");
        el.merkleCompareResult.classList.add("is-muted");
        return;
      }
      const file = el.merkleLocalFile?.files?.[0];
      if (!file) {
        el.merkleCompareResult.textContent = t("merkleNoFile");
        el.merkleCompareResult.classList.add("is-muted");
        return;
      }
      if (!window.isSecureContext || !window.crypto?.subtle) {
        el.merkleCompareResult.textContent = t("merkleVerifyNeedCrypto");
        el.merkleCompareResult.classList.add("is-bad");
        return;
      }
      const buf = await file.arrayBuffer();
      const hex = await sha256HexBuffer(buf);
      const expect = String(data.sha256 || "").toLowerCase();
      const match = hex === expect;
      el.merkleCompareResult.textContent = match ? t("merkleCompareOk") : t("merkleCompareFail");
      el.merkleCompareResult.classList.add(match ? "is-ok" : "is-bad");
    });
  }
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
    if (lastPreviewUrl) {
      URL.revokeObjectURL(lastPreviewUrl);
      lastPreviewUrl = null;
    }
    el.assetImage.src = data.assetUrl;
    el.assetImage.style.display = "block";
    el.assetEmpty.style.display = "none";
  } else if (lastPreviewUrl) {
    el.assetImage.src = lastPreviewUrl;
    el.assetImage.style.display = "block";
    el.assetEmpty.style.display = "none";
  } else {
    el.assetImage.style.display = "none";
    el.assetEmpty.style.display = "block";
  }

  renderMerkle(data);

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

function bindRecheck() {
  let inFlight = false;
  el.recheckButton.addEventListener("click", async () => {
    const tok = sessionToken;
    if (!tok || inFlight || el.recheckButton.disabled) return;
    inFlight = true;
    el.recheckButton.disabled = true;
    const t0 = Date.now();
    try {
      await triggerRecheck(tok);
      const fresh = await loadVerification(tok);
      render(fresh);
    } catch (err) {
      alert(err.message || t("recheckError"));
    } finally {
      inFlight = false;
      scheduleReenableButton(el.recheckButton, t0);
    }
  });
}

function bindUpload() {
  if (!el.uploadButton || !el.fileInput) return;
  let inFlight = false;
  const setUploadLocked = (locked) => {
    el.uploadButton.disabled = locked;
    el.fileInput.disabled = locked;
    if (el.ownerInput) el.ownerInput.disabled = locked;
  };

  el.uploadButton.addEventListener("click", async () => {
    if (inFlight || el.uploadButton.disabled) return;
    const file = el.fileInput.files?.[0];
    if (!file) {
      alert(t("uploadNeedFile"));
      return;
    }
    inFlight = true;
    setUploadLocked(true);
    const t0 = Date.now();

    if (lastPreviewUrl) {
      URL.revokeObjectURL(lastPreviewUrl);
      lastPreviewUrl = null;
    }
    if (file.type.startsWith("image/")) {
      lastPreviewUrl = URL.createObjectURL(file);
    }

    const fd = new FormData();
    fd.append("file", file);
    const owner = el.ownerInput?.value?.trim();
    if (owner) fd.append("owner", owner);

    el.uploadStatus.style.display = "block";
    el.uploadStatus.textContent = t("uploadWorking");
    try {
      const res = await fetch(`${API_BASE}/v1/verify/upload`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || res.statusText || String(res.status));
      }
      sessionToken = body.verification?.token || "";
      render(body.verification);
      el.uploadStatus.textContent = t("uploadOk");
    } catch (err) {
      el.uploadStatus.textContent = `${t("uploadFail")}: ${err.message || err}`;
      if (lastPreviewUrl) {
        URL.revokeObjectURL(lastPreviewUrl);
        lastPreviewUrl = null;
      }
    } finally {
      inFlight = false;
      const elapsed = Date.now() - t0;
      const wait = Math.max(0, BTN_COOLDOWN_MS - elapsed);
      window.setTimeout(() => {
        setUploadLocked(false);
      }, wait);
    }
  });
}

async function main() {
  initBranding();
  applyStaticI18n();
  sessionToken = getTokenFromUrl();
  bindUpload();

  if (!API_BASE) {
    setStatus("bad", __verityStaticPages ? t("githubPagesNeedApi") : t("loadFail"));
    if (el.merkleCard) el.merkleCard.style.display = "none";
    return;
  }

  if (el.merkleCard) el.merkleCard.style.display = "";

  bindRecheck();
  bindMerkle();

  if (sessionToken) {
    try {
      const data = await loadVerification(sessionToken);
      render(data);
    } catch (err) {
      setStatus("bad", err.message || t("loadFail"));
      renderMerkleStub();
    }
  } else {
    setStatus("warn", t("uploadOrTokenHint"));
    renderMerkleStub();
  }
}

main();
