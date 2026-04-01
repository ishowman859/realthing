const DEFAULT_VERITY_PUBLIC_API = "http://98.84.127.220:4000";

const params = new URLSearchParams(window.location.search);
const isGithubPages =
  /\.github\.io$/i.test(window.location.hostname) ||
  document.querySelector('meta[name="verity-gh-pages"]')?.getAttribute("content") === "1";
const h = window.location.hostname;
const apiFromMeta =
  document
    .querySelector('meta[name="verity-default-api"]')
    ?.getAttribute("content")
    ?.trim() || "";

function normalizeApiBase(b) {
  if (!b) return "";
  return String(b).trim().replace(/\/+$/, "");
}

function apiMetaForSecureSite() {
  if (!apiFromMeta) return "";
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    if (/^http:\/\//i.test(apiFromMeta)) return "";
  }
  return apiFromMeta;
}

const defaultApiBase = normalizeApiBase(
  params.get("api") ||
    (h === "localhost" || h === "127.0.0.1"
      ? "http://localhost:4000"
      : isGithubPages
        ? apiMetaForSecureSite()
        : apiFromMeta || DEFAULT_VERITY_PUBLIC_API)
);
const apiBaseInput = document.getElementById("apiBase");
const adminTokenInput = document.getElementById("adminToken");
const statusText = document.getElementById("statusText");
const healthText = document.getElementById("healthText");
const assetsBody = document.getElementById("assetsBody");
const batchesBody = document.getElementById("batchesBody");
const loadButton = document.getElementById("loadButton");
const saveButton = document.getElementById("saveButton");
const saveSolanaButton = document.getElementById("saveSolanaButton");
const solanaRpcUrlInput = document.getElementById("solanaRpcUrl");
const solanaClusterInput = document.getElementById("solanaCluster");
const solanaCommitmentInput = document.getElementById("solanaCommitment");
const solanaKeypairInput = document.getElementById("solanaKeypair");
const solanaAnchorDisabledInput = document.getElementById("solanaAnchorDisabled");
const solanaStatusText = document.getElementById("solanaStatusText");
const solanaFacts = document.getElementById("solanaFacts");

apiBaseInput.value = defaultApiBase;
adminTokenInput.value = localStorage.getItem("verity_admin_token") || "";

function fmt(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("ko-KR");
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.className = `status ${isError ? "bad" : "ok"}`;
}

function setSolanaStatus(text, isError = false) {
  solanaStatusText.textContent = text;
  solanaStatusText.className = `status ${isError ? "bad" : "ok"}`;
}

async function adminFetch(path) {
  const token = adminTokenInput.value.trim();
  const base = apiBaseInput.value.trim().replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    headers: {
      "x-admin-token": token,
    },
  });
  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`${response.status} ${msg}`);
  }
  return response.json();
}

async function adminJsonFetch(path, options = {}) {
  const token = adminTokenInput.value.trim();
  const base = apiBaseInput.value.trim().replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`${response.status} ${msg}`);
  }
  return response.json();
}

function renderAssets(rows) {
  assetsBody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${fmt(row.createdAt)}</td>
            <td class="mono">${row.serial || "-"}</td>
            <td class="mono">${row.owner || "-"}</td>
            <td>${row.mode || "-"}</td>
            <td>${row.mediaType || "-"}</td>
            <td>${typeof row.aiRiskScore === "number" ? row.aiRiskScore : "-"}</td>
            <td>${typeof row.duplicateScore === "number" ? row.duplicateScore : "-"}</td>
          `;
    assetsBody.appendChild(tr);
  }
}

function renderBatches(rows) {
  batchesBody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td class="mono">${fmt(row.minuteBucket)}</td>
            <td>${row.segment ?? 0}</td>
            <td>${row.status || "-"}</td>
            <td>${row.itemCount ?? "-"}</td>
            <td>${row.blockNumber ?? "-"}</td>
            <td>${fmt(row.sentAt)}</td>
          `;
    batchesBody.appendChild(tr);
  }
}

function renderSolanaFacts(status) {
  const rows = [
    ["Configured", status?.configured ? "yes" : "no"],
    ["Source", status?.source || "-"],
    ["Public Key", status?.publicKey || "-"],
    ["RPC URL", status?.rpcUrl || "-"],
    ["Cluster", status?.cluster || "-"],
    ["Commitment", status?.commitment || "-"],
    ["Anchor Disabled", status?.anchorDisabled ? "yes" : "no"],
    ["Runtime Keypair", status?.hasRuntimeKeypair ? "yes" : "no"],
    ["Env Keypair", status?.hasEnvKeypair ? "yes" : "no"],
    ["Updated At", fmt(status?.runtimeUpdatedAt)],
  ];
  solanaFacts.innerHTML = rows
    .map(
      ([label, value]) =>
        `<dt>${label}</dt><dd class="${label.includes("Key") || label.includes("RPC") ? "mono" : ""}">${value}</dd>`
    )
    .join("");
}

function fillSolanaForm(status) {
  solanaRpcUrlInput.value = status?.rpcUrl || "";
  solanaClusterInput.value = status?.cluster || "";
  solanaCommitmentInput.value = status?.commitment || "confirmed";
  solanaAnchorDisabledInput.checked = !!status?.anchorDisabled;
}

async function loadSolanaStatus() {
  const status = await adminFetch("/v1/admin/solana");
  fillSolanaForm(status);
  renderSolanaFacts(status);
  setSolanaStatus(
    status?.configured
      ? `준비 완료: ${status.publicKey || "공개키 없음"}`
      : "아직 온체인 앵커링 키가 설정되지 않았습니다.",
    !status?.configured
  );
}

async function loadAdminData() {
  setStatus("조회 중...");
  try {
    const [health, assets, batches] = await Promise.all([
      adminFetch("/v1/admin/health"),
      adminFetch("/v1/admin/assets?limit=50"),
      adminFetch("/v1/admin/batches?limit=30"),
    ]);
    healthText.textContent = JSON.stringify(health);
    renderAssets(assets);
    renderBatches(batches);
    await loadSolanaStatus();
    setStatus("조회 완료");
  } catch (error) {
    setStatus(`조회 실패: ${error.message}`, true);
    healthText.textContent = "-";
    assetsBody.innerHTML = "";
    batchesBody.innerHTML = "";
    solanaFacts.innerHTML = "";
    setSolanaStatus("-", true);
  }
}

loadButton.addEventListener("click", () => {
  void loadAdminData();
});

saveButton.addEventListener("click", () => {
  localStorage.setItem("verity_admin_token", adminTokenInput.value.trim());
  setStatus("토큰 저장 완료");
});

saveSolanaButton.addEventListener("click", async () => {
  setSolanaStatus("Solana 설정 저장 중...");
  try {
    const status = await adminJsonFetch("/v1/admin/solana", {
      method: "POST",
      body: {
        rpcUrl: solanaRpcUrlInput.value.trim(),
        cluster: solanaClusterInput.value.trim(),
        commitment: solanaCommitmentInput.value.trim(),
        keypair: solanaKeypairInput.value.trim(),
        anchorDisabled: solanaAnchorDisabledInput.checked,
      },
    });
    solanaKeypairInput.value = "";
    renderSolanaFacts(status.status);
    fillSolanaForm(status.status);
    setSolanaStatus(
      `저장 완료: ${status.status?.publicKey || status.saved?.publicKey || "-"}`,
      false
    );
  } catch (error) {
    setSolanaStatus(`저장 실패: ${error.message}`, true);
  }
});
