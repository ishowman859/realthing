const params = new URLSearchParams(window.location.search);
const isGithubPages =
  /\.github\.io$/i.test(window.location.hostname) ||
  document.querySelector('meta[name="verity-gh-pages"]')?.getAttribute("content") === "1";
const h = window.location.hostname;
const defaultApiBase =
  params.get("api") ||
  (h === "localhost" || h === "127.0.0.1"
    ? "http://localhost:4000"
    : isGithubPages
      ? ""
      : "/api");
const apiBaseInput = document.getElementById("apiBase");
const adminTokenInput = document.getElementById("adminToken");
const statusText = document.getElementById("statusText");
const healthText = document.getElementById("healthText");
const assetsBody = document.getElementById("assetsBody");
const batchesBody = document.getElementById("batchesBody");
const loadButton = document.getElementById("loadButton");
const saveButton = document.getElementById("saveButton");

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
    setStatus("조회 완료");
  } catch (error) {
    setStatus(`조회 실패: ${error.message}`, true);
    healthText.textContent = "-";
    assetsBody.innerHTML = "";
    batchesBody.innerHTML = "";
  }
}

loadButton.addEventListener("click", () => {
  void loadAdminData();
});

saveButton.addEventListener("click", () => {
  localStorage.setItem("verity_admin_token", adminTokenInput.value.trim());
  setStatus("토큰 저장 완료");
});
