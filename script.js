// Verity 검증 페이지 — API 연동 및 i18n
/** 저장소 기본 백엔드 (?api= · meta · Actions 변수가 우선). Pages(HTTPS)에서는 http 메타는 쓰지 않음(혼합 콘텐츠). */
const DEFAULT_VERITY_PUBLIC_API = "http://98.84.127.220:4000";

const __params = new URLSearchParams(window.location.search);
const __apiFromQuery = __params.get("api");
const __apiFromMeta =
  document
    .querySelector('meta[name="verity-default-api"]')
    ?.getAttribute("content")
    ?.trim() || "";
const __verityStaticPages =
  /\.github\.io$/i.test(window.location.hostname) ||
  document.querySelector('meta[name="verity-gh-pages"]')?.getAttribute("content") === "1";
const __host = window.location.hostname;
let API_BASE_ERROR = "";
function buildHttpVerifyRedirectTarget() {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const normalizedPath = String(path || "");
  let targetPath = "/verify";
  if (/^\/v\/[^/]+/i.test(normalizedPath)) {
    targetPath = normalizedPath;
  } else if (/^\/v(?:\/)?$/i.test(normalizedPath)) {
    targetPath = "/v";
  } else if (/^\/verify(?:\/)?$/i.test(normalizedPath)) {
    targetPath = "/verify";
  }
  return `${DEFAULT_VERITY_PUBLIC_API}${targetPath}`;
}

/** HTTPS 페이지에서는 meta의 http:// API를 무시 (?api= 또는 VERITY_PAGES_API 권장) */
function __apiMetaForSecureSite() {
  if (!__apiFromMeta) return "";
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    if (/^http:\/\//i.test(__apiFromMeta)) return "";
  }
  return __apiFromMeta;
}

/** API와 검증 페이지가 같은 호스트일 때(예: `http://서버:4000/v/토큰`) 자동으로 API 베이스를 맞춤 */
function inferApiBaseFromVerifyPageUrl() {
  if (__verityStaticPages) return "";
  const p = window.location.pathname;
  if (/\/v\/[^/]+/i.test(p)) return window.location.origin;
  return "";
}

function __normalizeApiBase(b) {
  if (!b) return "";
  return String(b).trim().replace(/\/+$/, "");
}

function maybeRedirectToHttpVerifyPage() {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:") return false;
  if (window.__VERITY_API_BASE__ || __apiFromQuery) return false;
  if (__apiMetaForSecureSite()) return false;
  if (!/^http:\/\//i.test(DEFAULT_VERITY_PUBLIC_API)) return false;

  const target = new URL(buildHttpVerifyRedirectTarget());
  const currentParams = new URLSearchParams(window.location.search);
  for (const [key, value] of currentParams.entries()) {
    if (key === "api") continue;
    target.searchParams.set(key, value);
  }
  window.location.replace(target.toString());
  return true;
}

const API_BASE = __normalizeApiBase(
  window.__VERITY_API_BASE__ ||
    __apiFromQuery ||
    inferApiBaseFromVerifyPageUrl() ||
    (__host === "localhost" || __host === "127.0.0.1"
      ? "http://localhost:4000"
      : __verityStaticPages
        ? __apiMetaForSecureSite()
        : __apiFromMeta || DEFAULT_VERITY_PUBLIC_API)
);

if (
  typeof window !== "undefined" &&
  window.location.protocol === "https:" &&
  /^http:\/\//i.test(API_BASE)
) {
  API_BASE_ERROR =
    "HTTPS 페이지에서는 HTTP 백엔드를 호출할 수 없습니다. 지금 백엔드가 HTTP(98.84.127.220:4000)만 열려 있어서 브라우저가 fetch를 차단합니다.";
}

const I18N = {
  ko: {
    htmlTitle: "Verity 검증 페이지",
    verificationEyebrow: "검증",
    pageTitle: "Verity 검증 페이지",
    pageSub:
      "사진을 올리면 브라우저가 SHA-256·pHash를 계산하고, 서버는 해시만 받아 인덱싱된 등록 기록을 찾아 보여줍니다.",
    serialLabel: "일련번호",
    modeLabel: "모드",
    createdAtLabel: "생성 시각",
    capturedAtLabel: "촬영 시각(기기)",
    onchainAtLabel: "온체인 시각",
    ownerLabel: "소유자",
    locationLabel: "위치 요약",
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
    noToken:
      "유효한 토큰이 없습니다. 아래에 토큰을 입력하거나 QR·공유 링크로 접속하세요.",
    tokenOrUrlHint:
      "검증 토큰을 입력한 뒤 「조회」를 누르거나 /v/토큰 링크로 접속하세요.",
    photoOrTokenHint:
      "사진을 선택한 뒤 「등록 기록 찾기」를 누르면 백엔드가 해시를 계산해 인덱싱된 기록을 찾습니다.",
    photoSectionLabel: "사진으로 검증",
    photoVerifyHelp:
      "이미지를 올리면 SHA-256과 pHash를 계산해 정확 일치와 유사 이미지를 함께 조회합니다.",
    photoVerifyButton: "등록 기록 찾기",
    photoVerifyWorking: "SHA-256 / pHash 계산 및 조회 중…",
    photoVerifyNeedFile: "이미지 파일을 선택하세요.",
    hashLookupNotFound: "일치하는 SHA-256 또는 pHash 기반 등록 기록이 없습니다.",
    tokenBlockLabel: "백엔드 해시 검색",
      tokenBlockHelp: "이미지 해시는 브라우저에서 계산하고 서버는 해시 기반 조회만 수행합니다.",
    lookupDivider: "",
    tokenPlaceholder: "",
    tokenLookupButton: "",
    tokenLookupWorking: "",
    tokenLookupNeedToken: "",
    recheckError: "재검증 요청 중 오류",
    loadFail: "조회 실패",
    githubPagesNeedApi:
      "API 주소가 없습니다. 저장소 Actions 변수 VERITY_PAGES_API(HTTPS 백엔드)를 설정하거나, URL에 ?api=https://백엔드주소 를 붙이세요.",
    httpsHttpBlocked:
      "HTTPS 페이지에서는 HTTP 백엔드를 호출할 수 없습니다. 현재 백엔드는 http://98.84.127.220:4000 이고, GitHub Pages 같은 HTTPS 페이지에서는 브라우저가 fetch를 막습니다.",
    uploadSectionLabel: "미디어 업로드",
    uploadHelp:
      "사진 또는 동영상을 올리면 서버가 해시를 계산하고 등록한 뒤 아래에 검증 결과를 표시합니다.",
    uploadButtonLabel: "업로드 및 등록",
    ownerOptionalPlaceholder: "owner (선택, 비우면 웹 게스트)",
    backpackConnect: "Backpack 연결",
    backpackDisconnect: "연결 해제",
    backpackMissing:
      "Backpack 브라우저 확장이 필요합니다. https://backpack.app 에서 설치한 뒤 이 페이지를 새로고침하세요.",
    backpackConnectFail: "Backpack 연결에 실패했습니다",
    backpackOwnerFilled: "Backpack 주소를 owner 필드에 넣었습니다. 업로드하면 해당 소유자로 등록됩니다.",
    uploadWorking: "업로드 및 서버 처리 중…",
    uploadOk: "등록 완료. 아래 검증 결과를 확인하세요.",
    uploadFail: "업로드 실패",
    uploadNeedFile: "파일을 선택하세요.",
    uploadOrTokenHint: "파일을 업로드하면 서버가 해시를 계산해 결과를 표시합니다.",
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
    merkleNoDataYet: "등록 기록을 불러오면 이웃 해시(머클 경로)가 여기 표시됩니다.",
    merkleChainTitle: "머클 트리 · 배치 머클 루트 (Solana 연동 MVP)",
    labelIndexedBlock: "인덱스 블록(분 단위 배치)",
    labelStoredRoot: "봉인된 머클 루트",
    labelComputedRoot: "서버 재계산 머클 루트",
    labelChainTx: "배치 트랜잭션/서명",
    merkleChainNote:
      "자산은 분(minute) 단위 배치로 묶여 머클 트리가 만들어지고, 위 루트·아래 이웃 해시(경로)로 온체인 인덱스와 대조합니다. 실제 Solana 메인넷 앵커는 운영 환경에 맞게 확장하면 됩니다.",
    merkleVizTitle: "머클 경로 시각화 (루트 → 리프)",
    merkleVizComputing: "경로 해시 계산 중…",
    merkleVizMatchOk: "재계산 루트가 공개 루트와 일치합니다.",
    merkleVizMatchBad: "재계산 루트가 공개 루트와 다릅니다.",
    merkleVizStepMerge: "이웃 해시와 병합",
    merkleVizChildBelow: "병합 전 하위 해시",
    merkleVizFormulaLeft: "H(이웃 ‖ 하위)",
    merkleVizFormulaRight: "H(하위 ‖ 이웃)",
    merkleVizNoLeaf: "리프 해시가 없어 경로를 그릴 수 없습니다.",
  },
  en: {
    htmlTitle: "Verity Verification",
    verificationEyebrow: "Verification",
    pageTitle: "Verity Verification",
    pageSub:
        "Upload a photo and the browser computes SHA-256 and pHash before asking the server to search the indexed registrations.",
    tokenOrUrlHint:
      "Upload a photo and the backend will hash it to find indexed registrations.",
    photoOrTokenHint:
        "Choose a photo and press Find registration. The browser computes the hashes and the server searches the index.",
    photoSectionLabel: "Verify with a photo",
    photoVerifyHelp:
      "Upload an image to compute both SHA-256 and pHash, then search for exact and similar registrations.",
    photoVerifyButton: "Find registration",
    photoVerifyWorking: "Computing SHA-256 / pHash and searching…",
    photoVerifyNeedFile: "Choose an image file first.",
    hashLookupNotFound: "No registration found for this SHA-256 or pHash.",
    tokenBlockLabel: "Backend hash search",
      tokenBlockHelp: "The browser hashes the image and the server only performs a hash lookup.",
    lookupDivider: "",
    tokenPlaceholder: "",
    tokenLookupButton: "",
    tokenLookupWorking: "",
    tokenLookupNeedToken: "",
    serialLabel: "Serial",
    modeLabel: "Mode",
    createdAtLabel: "Created At",
    capturedAtLabel: "Captured At (Device)",
    onchainAtLabel: "On-chain Time",
    ownerLabel: "Owner",
    locationLabel: "Location",
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
    noToken: "No token in the URL. Paste a token below or open a QR/share link.",
    recheckError: "Error while requesting recheck",
    loadFail: "Failed to load",
    githubPagesNeedApi:
      "On GitHub Pages, set the API URL: add ?api=https://your-api-host to the URL.",
    httpsHttpBlocked:
      "This HTTPS page cannot call an HTTP backend. The current backend is http://98.84.127.220:4000, so the browser blocks the fetch.",
    uploadSectionLabel: "Upload media",
    uploadHelp:
      "Upload a photo or video: the server computes hashes, registers the asset, and shows verification below.",
    uploadButtonLabel: "Upload & register",
    ownerOptionalPlaceholder: "owner (optional)",
    backpackConnect: "Connect Backpack",
    backpackDisconnect: "Disconnect",
    backpackMissing:
      "Install the Backpack browser extension from https://backpack.app and refresh this page.",
    backpackConnectFail: "Could not connect to Backpack",
    backpackOwnerFilled: "Wallet address filled as owner. Uploads will register to this owner.",
    uploadWorking: "Uploading…",
    uploadOk: "Registered. See verification below.",
    uploadFail: "Upload failed",
    uploadNeedFile: "Choose a file first.",
    uploadOrTokenHint: "Upload a file and the server will hash and search it.",
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
    merkleNoDataYet: "Load a registration to see sibling hashes (Merkle path) here.",
    merkleChainTitle: "Merkle tree · batch root (Solana MVP)",
    labelIndexedBlock: "Indexed block (minute batch)",
    labelStoredRoot: "Sealed Merkle root",
    labelComputedRoot: "Server-recomputed Merkle root",
    labelChainTx: "Batch tx / signature",
    merkleChainNote:
      "Assets are batched per minute; the root above and the sibling hashes below form the Merkle path checked against the indexed batch. Wire real Solana anchoring for your network.",
    merkleVizTitle: "Merkle path (root → leaf)",
    merkleVizComputing: "Computing path hashes…",
    merkleVizMatchOk: "Recomputed root matches the published Merkle root.",
    merkleVizMatchBad: "Recomputed root does not match the published Merkle root.",
    merkleVizStepMerge: "Merge with sibling",
    merkleVizChildBelow: "Child hash before merge",
    merkleVizFormulaLeft: "H(sibling ‖ child)",
    merkleVizFormulaRight: "H(child ‖ sibling)",
    merkleVizNoLeaf: "No leaf hash; cannot draw the path.",
  },
  ja: {
    htmlTitle: "Verity 検証ページ",
    verificationEyebrow: "検証",
    pageTitle: "Verity 検証ページ",
    pageSub:
      "ブラウザで画像の SHA-256 を計算し、登録の有無を照会します。トークン・QR リンクにも対応します。",
    tokenOrUrlHint:
      "トークンを入力して「照会」を押すか、/v/トークン のリンクで開いてください。",
    photoOrTokenHint:
      "画像を選んで登録を検索するか、トークン・/v/ リンクで開いてください。",
    photoSectionLabel: "写真で検証",
    photoVerifyHelp:
      "同一バイト列なら SHA-256 は一致します。ハッシュはブラウザ内のみで計算し、サーバーは登録の照会のみ行います。",
    photoVerifyButton: "登録を検索",
    photoVerifyWorking: "ハッシュ計算・照会中…",
    photoVerifyNeedFile: "画像ファイルを選んでください。",
    hashLookupNotFound: "この SHA-256 の登録はありません。",
    tokenBlockLabel: "検証トークン · QR",
    tokenBlockHelp: "共有リンクのトークンがあればここで照会できます。",
    lookupDivider: "または",
    tokenPlaceholder: "検証トークンを貼り付け",
    tokenLookupButton: "トークンで照会",
    tokenLookupWorking: "読み込み中…",
    tokenLookupNeedToken: "検証トークンを入力してください。",
    serialLabel: "シリアル番号",
    modeLabel: "モード",
    createdAtLabel: "作成時刻",
    capturedAtLabel: "撮影時刻 (端末)",
    onchainAtLabel: "オンチェーン時刻",
    ownerLabel: "所有者",
    locationLabel: "位置要約",
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
    noToken:
      "URL にトークンがありません。下に貼り付けるか QR/共有リンクで開いてください。",
    recheckError: "再検証リクエスト中にエラー",
    loadFail: "取得失敗",
    githubPagesNeedApi:
      "API の URL がありません。リポジトリの Actions 変数 VERITY_PAGES_API（HTTPS）を設定するか、?api=https://バックエンド を付けてください。",
    httpsHttpBlocked:
      "HTTPS ページから HTTP バックエンドは呼べません。現在のバックエンドは http://98.84.127.220:4000 のため、ブラウザが fetch を遮断します。",
    uploadSectionLabel: "メディアアップロード",
    uploadHelp: "写真または動画を送ると、サーバーがハッシュを計算して登録し、下に検証結果を表示します。",
    uploadButtonLabel: "アップロードして登録",
    ownerOptionalPlaceholder: "owner（任意）",
    backpackConnect: "Backpack を接続",
    backpackDisconnect: "切断",
    backpackMissing:
      "Backpack ブラウザ拡張が必要です。https://backpack.app からインストールしてページを再読み込みしてください。",
    backpackConnectFail: "Backpack 接続に失敗しました",
    backpackOwnerFilled: "ウォレットアドレスを owner に入力しました。アップロードはこの所有者として登録されます。",
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
    merkleNoDataYet: "登録を読み込むと隣接ハッシュ（マークルパス）が表示されます。",
    merkleChainTitle: "マークルツリー・バッチルート（Solana MVP）",
    labelIndexedBlock: "インデックスブロック（分単位バッチ）",
    labelStoredRoot: "封切られたマークルルート",
    labelComputedRoot: "サーバー再計算ルート",
    labelChainTx: "バッチ Tx / 署名",
    merkleChainNote:
      "アセットは分単位バッチでまとめられ、上記ルートと下の隣接ハッシュでインデックスと照合します。本番 Solana アンカーは環境に合わせて接続してください。",
    merkleVizTitle: "マークルパス可視化（ルート→リーフ）",
    merkleVizComputing: "パスを計算中…",
    merkleVizMatchOk: "再計算ルートが公開ルートと一致しました。",
    merkleVizMatchBad: "再計算ルートが公開ルートと一致しません。",
    merkleVizStepMerge: "隣接ハッシュとマージ",
    merkleVizChildBelow: "マージ前の下位ハッシュ",
    merkleVizFormulaLeft: "H(隣接 ‖ 子)",
    merkleVizFormulaRight: "H(子 ‖ 隣接)",
    merkleVizNoLeaf: "リーフがありません。",
  },
  zh: {
    htmlTitle: "Verity 验证页面",
    verificationEyebrow: "验证",
    pageTitle: "Verity 验证页面",
    pageSub: "在浏览器中计算图片 SHA-256 并查找是否已登记。仍支持令牌与 QR 链接。",
    tokenOrUrlHint: "输入令牌后点「查询」，或使用 /v/令牌 链接打开。",
    photoOrTokenHint: "选择图片查找登记，或使用令牌、/v/ 链接打开。",
    photoSectionLabel: "用照片验证",
    photoVerifyHelp:
      "文件字节相同则 SHA-256 相同。哈希仅在浏览器内计算，服务器只查询是否有登记。",
    photoVerifyButton: "查找登记",
    photoVerifyWorking: "正在计算哈希并查询…",
    photoVerifyNeedFile: "请先选择图片文件。",
    hashLookupNotFound: "没有与此 SHA-256 匹配的登记。",
    tokenBlockLabel: "验证令牌 · QR 链接",
    tokenBlockHelp: "若有分享链接中的令牌，可在此查询。",
    lookupDivider: "或",
    tokenPlaceholder: "粘贴验证令牌",
    tokenLookupButton: "按令牌查询",
    tokenLookupWorking: "加载中…",
    tokenLookupNeedToken: "请输入验证令牌。",
    serialLabel: "序列号",
    modeLabel: "模式",
    createdAtLabel: "创建时间",
    capturedAtLabel: "拍摄时间（设备）",
    onchainAtLabel: "链上时间",
    ownerLabel: "所有者",
    locationLabel: "位置摘要",
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
    noToken: "链接中没有令牌。请在下方粘贴或使用二维码/分享链接打开。",
    recheckError: "请求重新验证时出错",
    loadFail: "加载失败",
    githubPagesNeedApi:
      "缺少 API 地址：请设置仓库 Actions 变量 VERITY_PAGES_API（HTTPS），或在 URL 加上 ?api=https://你的后端",
    httpsHttpBlocked:
      "HTTPS 页面不能调用 HTTP 后端。当前后端是 http://98.84.127.220:4000，因此浏览器会阻止 fetch。",
    uploadSectionLabel: "上传媒体",
    uploadHelp: "上传照片或视频后，服务器会计算哈希并注册，在下方显示验证结果。",
    uploadButtonLabel: "上传并登记",
    ownerOptionalPlaceholder: "owner（可选）",
    backpackConnect: "连接 Backpack",
    backpackDisconnect: "断开",
    backpackMissing: "需要安装 Backpack 浏览器扩展： https://backpack.app 安装后刷新本页。",
    backpackConnectFail: "Backpack 连接失败",
    backpackOwnerFilled: "已将钱包地址填入 owner。上传将登记到该所有者。",
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
    merkleNoDataYet: "加载登记后，将在此显示邻接哈希（默克尔路径）。",
    merkleChainTitle: "默克尔树 · 批次根（Solana MVP）",
    labelIndexedBlock: "索引区块（按分钟批次）",
    labelStoredRoot: "已封存的默克尔根",
    labelComputedRoot: "服务器重算默克尔根",
    labelChainTx: "批次交易 / 签名",
    merkleChainNote:
      "资产按分钟批次聚合成默克尔树；用上述根与下方邻接哈希路径与索引对照。可按环境接入真实 Solana 上链。",
    merkleVizTitle: "默克尔路径可视化（根 → 叶）",
    merkleVizComputing: "正在计算路径哈希…",
    merkleVizMatchOk: "重算根与公开默克尔根一致。",
    merkleVizMatchBad: "重算根与公开默克尔根不一致。",
    merkleVizStepMerge: "与邻接哈希合并",
    merkleVizChildBelow: "合并前的子哈希",
    merkleVizFormulaLeft: "H(邻接 ‖ 子)",
    merkleVizFormulaRight: "H(子 ‖ 邻接)",
    merkleVizNoLeaf: "无叶子哈希，无法绘制路径。",
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

async function loadImageBitmapFromFile(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to img element path
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function computeBrowserImagePhash(file) {
  const source = await loadImageBitmapFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("브라우저 캔버스를 초기화하지 못했습니다.");
  ctx.drawImage(source, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32);
  const matrix = [];
  for (let y = 0; y < 32; y += 1) {
    const row = [];
    for (let x = 0; x < 32; x += 1) {
      const idx = (y * 32 + x) * 4;
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      row.push(gray);
    }
    matrix.push(row);
  }

  const dct = [];
  for (let u = 0; u < 32; u += 1) {
    dct[u] = [];
    for (let v = 0; v < 32; v += 1) {
      let sum = 0;
      for (let x = 0; x < 32; x += 1) {
        for (let y = 0; y < 32; y += 1) {
          sum +=
            matrix[x][y] *
            Math.cos(((2 * x + 1) * u * Math.PI) / 64) *
            Math.cos(((2 * y + 1) * v * Math.PI) / 64);
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u][v] = (cu * cv * sum) / 16;
    }
  }

  const lowFreq = [];
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      if (i === 0 && j === 0) continue;
      lowFreq.push(dct[i][j]);
    }
  }
  const avg = lowFreq.reduce((sum, value) => sum + value, 0) / lowFreq.length;
  let bits = lowFreq.map((value) => (value > avg ? "1" : "0")).join("");
  while (bits.length < 64) bits += "0";
  bits = bits.slice(0, 64);

  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function shortHashHex(hex, pre = 7, post = 5) {
  const h = String(hex || "");
  if (h.length <= pre + post + 1) return h;
  return `${h.slice(0, pre)}…${h.slice(-post)}`;
}

async function buildMerklePathLevels(leafHash, proof) {
  const levels = [{ hash: leafHash, sibling: null, position: null, childHash: null }];
  if (!leafHash || !Array.isArray(proof) || proof.length === 0) {
    return { levels, computedRoot: leafHash || "" };
  }
  let acc = leafHash;
  for (const node of proof) {
    const sib = String(node?.hash || "");
    const pos = String(node?.position || "");
    if (!sib || (pos !== "left" && pos !== "right")) {
      return { levels, computedRoot: acc, badProof: true };
    }
    const child = acc;
    const pair = pos === "left" ? `${sib}${child}` : `${child}${sib}`;
    acc = await sha256HexUtf8(pair);
    levels.push({ hash: acc, sibling: sib, position: pos, childHash: child });
  }
  return { levels, computedRoot: acc };
}

async function resolveLeafHashForMerkleViz(data) {
  if (data.merkleLeafHash) return String(data.merkleLeafHash);
  if (data.assetId && window.crypto?.subtle) {
    return createClientLeafHash(data);
  }
  return "";
}

async function paintMerkleTreeViz(data, proof) {
  const container = el.merkleTreeViz;
  if (!container) return;

  if (!window.isSecureContext || !window.crypto?.subtle) {
    container.hidden = false;
    container.innerHTML = `<p class="merkle-viz__loading">${escapeHtml(t("merkleVerifyNeedCrypto"))}</p>`;
    return;
  }

  container.hidden = false;
  container.innerHTML = `<p class="merkle-viz__loading">${escapeHtml(t("merkleVizComputing"))}</p>`;

  const leafHash = await resolveLeafHashForMerkleViz(data);
  if (!leafHash) {
    container.innerHTML = `<p class="merkle-viz__loading">${escapeHtml(t("merkleVizNoLeaf"))}</p>`;
    return;
  }

  const { levels, computedRoot, badProof } = await buildMerklePathLevels(leafHash, proof);
  if (badProof) {
    container.innerHTML = `<p class="merkle-viz__loading">${escapeHtml(t("merkleVerifyFail"))}</p>`;
    return;
  }

  const serverRoot = String(data.merkleRoot || "");
  const match = !!(serverRoot && computedRoot === serverRoot);
  const topDown = levels.slice().reverse();

  const parts = [];
  parts.push(`<div class="merkle-viz__title">${escapeHtml(t("merkleVizTitle"))}</div>`);
  if (serverRoot) {
    parts.push(
      `<div class="merkle-viz__match ${match ? "merkle-viz__match--ok" : "merkle-viz__match--bad"}">${escapeHtml(match ? t("merkleVizMatchOk") : t("merkleVizMatchBad"))}</div>`
    );
  }

  parts.push(
    `<div class="merkle-viz__row"><div class="merkle-viz__node merkle-viz__node--root"><span class="merkle-viz__badge">ROOT</span><code class="merkle-viz__hash" title="${escapeAttr(serverRoot)}">${escapeHtml(serverRoot)}</code></div></div>`
  );

  for (let k = 0; k < topDown.length - 1; k++) {
    const upper = topDown[k];
    const lower = topDown[k + 1];
    const isLast = k === topDown.length - 2;
    const formula =
      upper.position === "left" ? t("merkleVizFormulaLeft") : t("merkleVizFormulaRight");

    parts.push(`<div class="merkle-viz__connector" aria-hidden="true">↓</div>`);
    parts.push(`<div class="merkle-viz__step">
      <span class="merkle-viz__step-label">${escapeHtml(t("merkleVizStepMerge"))} · ${escapeHtml(formula)}</span>
      <div class="merkle-viz__sibling" title="${escapeAttr(upper.sibling)}">${escapeHtml(upper.sibling)}</div>
      <span class="merkle-viz__pos">${escapeHtml(String(upper.position || "").toUpperCase())}</span>
      <div class="merkle-viz__child-hint">${escapeHtml(t("merkleVizChildBelow"))}: ${escapeHtml(shortHashHex(upper.childHash))}</div>
    </div>`);

    parts.push(
      `<div class="merkle-viz__row"><div class="merkle-viz__node${isLast ? " merkle-viz__node--leaf" : ""}"><span class="merkle-viz__badge">${isLast ? "LEAF" : String(k + 1)}</span><code class="merkle-viz__hash" title="${escapeAttr(lower.hash)}">${escapeHtml(lower.hash)}</code></div></div>`
    );
  }

  container.innerHTML = parts.join("");
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

let lastLocalPreviewUrl = null;
let lastSearchResult = null;

function revokeLocalPreview() {
  if (lastLocalPreviewUrl) {
    URL.revokeObjectURL(lastLocalPreviewUrl);
    lastLocalPreviewUrl = null;
  }
}

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
  labelPhotoVerify: document.getElementById("labelPhotoVerify"),
  photoVerifyHelp: document.getElementById("photoVerifyHelp"),
  verifyPhotoInput: document.getElementById("verifyPhotoInput"),
  verifyPhotoBtn: document.getElementById("verifyPhotoBtn"),
  verifyPhotoStatus: document.getElementById("verifyPhotoStatus"),
  searchMeta: document.getElementById("searchMeta"),
  searchMetaSummary: document.getElementById("searchMetaSummary"),
  searchMetaHashes: document.getElementById("searchMetaHashes"),
  similarMatchesWrap: document.getElementById("similarMatchesWrap"),
  similarMatchesList: document.getElementById("similarMatchesList"),
  labelSerial: document.getElementById("labelSerial"),
  labelMode: document.getElementById("labelMode"),
  labelCreatedAt: document.getElementById("labelCreatedAt"),
  labelCapturedAt: document.getElementById("labelCapturedAt"),
  labelOnchainAt: document.getElementById("labelOnchainAt"),
  labelOwner: document.getElementById("labelOwner"),
  labelLocation: document.getElementById("labelLocation"),
  labelHashInfo: document.getElementById("labelHashInfo"),
  locationSummary: document.getElementById("locationSummary"),
  gpsVal: document.getElementById("gpsVal"),
  metadataVal: document.getElementById("metadataVal"),
  labelOriginalFile: document.getElementById("labelOriginalFile"),
  statusBadge: document.getElementById("statusBadge"),
  mode: document.getElementById("mode"),
  createdAt: document.getElementById("createdAt"),
  capturedAt: document.getElementById("capturedAt"),
  onchainAt: document.getElementById("onchainAt"),
  owner: document.getElementById("owner"),
  serial: document.getElementById("serial"),
  monitorAlert: document.getElementById("monitorAlert"),
  sha256: document.getElementById("sha256"),
  phash: document.getElementById("phash"),
  assetImage: document.getElementById("assetImage"),
  assetEmpty: document.getElementById("assetEmpty"),
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
  merkleChainPanel: document.getElementById("merkleChainPanel"),
  merkleChainTitle: document.getElementById("merkleChainTitle"),
  labelIndexedBlock: document.getElementById("labelIndexedBlock"),
  indexedBlockVal: document.getElementById("indexedBlockVal"),
  labelStoredRoot: document.getElementById("labelStoredRoot"),
  storedRootVal: document.getElementById("storedRootVal"),
  labelComputedRoot: document.getElementById("labelComputedRoot"),
  computedRootVal: document.getElementById("computedRootVal"),
  labelChainTx: document.getElementById("labelChainTx"),
  chainTxVal: document.getElementById("chainTxVal"),
  sha256TreeRootVal: document.getElementById("sha256TreeRootVal"),
  sha256TreeMeta: document.getElementById("sha256TreeMeta"),
  phashTreeRootVal: document.getElementById("phashTreeRootVal"),
  phashTreeMeta: document.getElementById("phashTreeMeta"),
  anchorSourceVal: document.getElementById("anchorSourceVal"),
  anchorPayloadVal: document.getElementById("anchorPayloadVal"),
  anchorExplorerLink: document.getElementById("anchorExplorerLink"),
  merkleChainNote: document.getElementById("merkleChainNote"),
  merkleTreeViz: document.getElementById("merkleTreeViz"),
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
  setText(el.labelLocation, t("locationLabel"));
  setText(el.labelHashInfo, t("hashInfoLabel"));
  setText(el.labelOriginalFile, t("originalFileLabel"));
  setText(el.labelActions, t("actionsLabel"));
  setText(el.recheckButton, t("recheckButton"));
  setText(el.assetEmpty, t("noImage"));
  el.assetImage.alt = t("assetAlt");
  if (el.labelPhotoVerify) setText(el.labelPhotoVerify, t("photoSectionLabel"));
  if (el.photoVerifyHelp) el.photoVerifyHelp.textContent = t("photoVerifyHelp");
  if (el.verifyPhotoBtn) setText(el.verifyPhotoBtn, t("photoVerifyButton"));
  setStatus("warn", t("loading"));
  if (el.labelMerkleSection) setText(el.labelMerkleSection, t("merkleSectionLabel"));
  if (el.labelMerkleRoot) setText(el.labelMerkleRoot, t("labelMerkleRootPub"));
  if (el.labelMerkleLeaf) setText(el.labelMerkleLeaf, t("labelMerkleLeafSer"));
  if (el.labelMerklePathLen) setText(el.labelMerklePathLen, t("labelMerklePathLen"));
  if (el.merkleProofSummary) el.merkleProofSummary.textContent = t("merkleProofSummary");
  if (el.merkleVerifyBtn) el.merkleVerifyBtn.textContent = t("merkleVerifyBtn");
  if (el.merkleCompareBtn) el.merkleCompareBtn.textContent = t("merkleCompareBtn");
  if (el.labelMerkleLocal) setText(el.labelMerkleLocal, t("merkleLocalLabel"));
  if (el.merkleChainTitle) el.merkleChainTitle.textContent = t("merkleChainTitle");
  if (el.labelIndexedBlock) el.labelIndexedBlock.textContent = t("labelIndexedBlock");
  if (el.labelStoredRoot) el.labelStoredRoot.textContent = t("labelStoredRoot");
  if (el.labelComputedRoot) el.labelComputedRoot.textContent = t("labelComputedRoot");
  if (el.labelChainTx) el.labelChainTx.textContent = t("labelChainTx");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(DATE_LOCALE);
}

function updateMonitorAlert(data) {
  if (!el.monitorAlert) return;
  el.monitorAlert.style.display = "none";
  el.monitorAlert.textContent = "";
}

function setStatus(type, text) {
  el.statusBadge.className = `status ${type}`;
  el.statusBadge.textContent = text;
}

function setText(node, value) {
  if (!node) return;
  node.textContent = value && String(value).trim() ? String(value) : "-";
}

function renderMerkleChain(data) {
  const panel = el.merkleChainPanel;
  if (!panel) return;
  if (!data || !data.token) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  setText(
    el.indexedBlockVal,
    data.indexedBlockNumber != null ? String(data.indexedBlockNumber) : "-"
  );
  setText(el.storedRootVal, data.merkleRoot || "-");
  setText(el.computedRootVal, data.computedMerkleRoot || "-");
  const tx = data.chainTxSignature;
  setText(el.chainTxVal, tx && String(tx).trim() ? String(tx) : "-");
  renderMerkleTreeCards(data);
  renderAnchorCard(data);
  if (el.merkleChainNote) el.merkleChainNote.textContent = t("merkleChainNote");
}

function renderMerkleTreeCards(data) {
  const shaTree = data?.merkleTrees?.sha256 || null;
  const phTree = data?.merkleTrees?.phash || null;
  setText(el.sha256TreeRootVal, data?.batchMerkleRoots?.sha256 || shaTree?.storedRoot || "-");
  setText(el.phashTreeRootVal, data?.batchMerkleRoots?.phash || phTree?.storedRoot || "-");
  if (el.sha256TreeMeta) {
    el.sha256TreeMeta.textContent = [
      `leaf: ${shaTree?.leafHash || "-"}`,
      `proof: ${Array.isArray(shaTree?.proof) ? shaTree.proof.length : 0}`,
      `verified: ${shaTree?.verified ? "yes" : "no"}`,
    ].join("\n");
  }
  if (el.phashTreeMeta) {
    el.phashTreeMeta.textContent = [
      `leaf: ${phTree?.leafHash || "-"}`,
      `proof: ${Array.isArray(phTree?.proof) ? phTree.proof.length : 0}`,
      `verified: ${phTree?.verified ? "yes" : "no"}`,
    ].join("\n");
  }
}

function renderAnchorCard(data) {
  if (el.anchorSourceVal) {
    const source = data?.batchAnchor?.source === "solana" ? "Solana + DB" : "DB only";
    el.anchorSourceVal.textContent = source;
  }
  if (el.anchorPayloadVal) {
    const payload = data?.batchAnchor?.payload;
    el.anchorPayloadVal.textContent = payload
      ? JSON.stringify(payload, null, 2)
      : "-";
  }
  if (el.anchorExplorerLink) {
    const href = data?.batchAnchor?.explorerUrl || "";
    if (href) {
      el.anchorExplorerLink.hidden = false;
      el.anchorExplorerLink.href = href;
    } else {
      el.anchorExplorerLink.hidden = true;
      el.anchorExplorerLink.removeAttribute("href");
    }
  }
}

function renderSearchMeta(result) {
  lastSearchResult = result || null;
  if (!el.searchMeta || !el.searchMetaSummary || !el.searchMetaHashes) return;
  if (!result) {
    el.searchMeta.hidden = true;
    el.searchMetaSummary.textContent = "";
    el.searchMetaHashes.textContent = "";
    if (el.similarMatchesWrap) el.similarMatchesWrap.hidden = true;
    if (el.similarMatchesList) el.similarMatchesList.replaceChildren();
    return;
  }

  el.searchMeta.hidden = false;
  let summary = "SHA-256 exact match 없음";
  if (result?.exactMatchType === "sha256") {
    summary = "SHA-256 exact match · 100% 일치";
  } else if (result?.exactPhashMatch) {
    summary = "pHash exact match · 유사 판정";
  } else if (typeof result?.bestPhashScore === "number") {
    summary = `pHash 유사 후보 · ${Number(result.bestPhashScore).toFixed(2)}%`;
  }
  el.searchMetaSummary.textContent = summary;

  const parts = [];
  if (result.query?.sha256) parts.push(`SHA-256: ${result.query.sha256}`);
  if (result.query?.phash) parts.push(`pHash: ${result.query.phash}`);
  if (result?.exactPhashMatch?.serial) {
    parts.push(`pHash exact serial: ${result.exactPhashMatch.serial}`);
  }
  el.searchMetaHashes.textContent = parts.join("\n");

  const similar = Array.isArray(result.similarMatches) ? result.similarMatches : [];
  if (!el.similarMatchesWrap || !el.similarMatchesList) return;
  el.similarMatchesList.replaceChildren();
  if (similar.length === 0) {
    el.similarMatchesWrap.hidden = true;
    return;
  }
  el.similarMatchesWrap.hidden = false;
  similar.forEach((item) => {
    if (!item) return;
    const li = document.createElement("li");
    const score =
      typeof item.score === "number" ? item.score.toFixed(2) : String(item.score || "-");
    li.textContent = `${score}% · ${item.serial || "-"} · ${item.owner || "-"}`;
    el.similarMatchesList.appendChild(li);
  });
}

function renderMerkleStub() {
  if (!el.merkleCard || !el.merkleIntro) return;
  lastVerificationPayload = null;
  renderSearchMeta(lastSearchResult);
  if (el.merkleChainPanel) el.merkleChainPanel.hidden = true;
  if (el.anchorExplorerLink) {
    el.anchorExplorerLink.hidden = true;
    el.anchorExplorerLink.removeAttribute("href");
  }
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
  if (el.merkleTreeViz) {
    el.merkleTreeViz.innerHTML = "";
    el.merkleTreeViz.hidden = true;
  }
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
    if (el.merkleTreeViz) {
      el.merkleTreeViz.innerHTML = "";
      el.merkleTreeViz.hidden = true;
    }
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

  if (el.merkleTreeViz) {
    void paintMerkleTreeViz(data, proof);
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

async function searchVerificationByHashes(file) {
  setStatus("warn", t("fetchingVerification"));
  const sha256 = await sha256HexBuffer(await file.arrayBuffer());
  let phash = null;
  try {
    phash = await computeBrowserImagePhash(file);
  } catch (err) {
    console.warn("pHash compute failed; continuing with SHA-256 only", err);
  }
  const res = await fetch(`${API_BASE}/v1/verify/search-hashes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sha256,
      phash,
      mediaType: "photo",
      fileName: file.name || null,
      mimeType: file.type || null,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || t("failedLoadVerification"));
  }
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
  setText(el.locationSummary, data.locationSummary || "-");
  setText(el.sha256, data.sha256 || "-");
  setText(el.phash, data.phash || "-");
  if (el.gpsVal) {
    const lat = Number(data?.gps?.lat);
    const lng = Number(data?.gps?.lng);
    el.gpsVal.textContent =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        : "-";
  }
  if (el.metadataVal) {
    el.metadataVal.textContent = data.metadata
      ? JSON.stringify(data.metadata, null, 2)
      : "-";
  }
  updateMonitorAlert(data);

  if (data.assetUrl) {
    revokeLocalPreview();
    el.assetImage.src = data.assetUrl;
    el.assetImage.style.display = "block";
    el.assetEmpty.style.display = "none";
  } else if (lastLocalPreviewUrl) {
    el.assetImage.src = lastLocalPreviewUrl;
    el.assetImage.style.display = "block";
    el.assetEmpty.style.display = "none";
  } else {
    el.assetImage.style.display = "none";
    el.assetEmpty.style.display = "block";
  }

  renderMerkleChain(data);
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

function bindPhotoVerify() {
  const btn = el.verifyPhotoBtn;
  const input = el.verifyPhotoInput;
  const status = el.verifyPhotoStatus;
  if (!btn || !input) return;

  const run = async () => {
    if (API_BASE_ERROR) {
      alert(t("httpsHttpBlocked"));
      setStatus("bad", t("httpsHttpBlocked"));
      return;
    }
    if (!API_BASE) {
      alert(__verityStaticPages ? t("githubPagesNeedApi") : t("loadFail"));
      return;
    }
    const file = input.files?.[0];
    if (!file) {
      alert(t("photoVerifyNeedFile"));
      return;
    }
    if (btn.disabled) return;
    btn.disabled = true;
    const t0 = Date.now();
    if (status) {
      status.style.display = "block";
      status.textContent = t("photoVerifyWorking");
    }
    try {
      const result = await searchVerificationByHashes(file);
      const data = result?.verification || null;
      revokeLocalPreview();
      lastLocalPreviewUrl = URL.createObjectURL(file);
      renderSearchMeta(result);
      if (!data) {
        const score =
          typeof result?.bestPhashScore === "number"
            ? ` (best pHash ${Number(result.bestPhashScore).toFixed(2)}%)`
            : "";
        if (status) {
          status.textContent = `등록 기록을 찾지 못했습니다${score}`;
          status.style.display = "block";
        }
        setStatus("warn", `등록 기록을 찾지 못했습니다${score}`);
        renderMerkleStub();
        return;
      }
      render(data);
      if (status) {
        status.textContent = "";
        status.style.display = "none";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("loadFail");
      revokeLocalPreview();
      if (status) {
        status.textContent = message;
        status.style.display = "block";
      }
      setStatus("bad", message);
      renderMerkleStub();
    } finally {
      scheduleReenableButton(btn, t0);
    }
  };

  btn.addEventListener("click", run);
}

async function main() {
  if (maybeRedirectToHttpVerifyPage()) return;
  initBranding();
  applyStaticI18n();
  bindPhotoVerify();

  if (!API_BASE) {
    setStatus("bad", __verityStaticPages ? t("githubPagesNeedApi") : t("loadFail"));
    if (el.merkleCard) el.merkleCard.style.display = "none";
    return;
  }
  if (API_BASE_ERROR) {
    setStatus("bad", t("httpsHttpBlocked"));
    if (el.merkleCard) el.merkleCard.style.display = "none";
    return;
  }

  if (el.merkleCard) el.merkleCard.style.display = "";
  bindMerkle();
  setStatus("warn", t("photoOrTokenHint"));
  renderSearchMeta(null);
  renderMerkleStub();
}

main();
