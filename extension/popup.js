import { isFacebookVideoUrl, parseUrlList } from "./url.js";

const urlsEl = document.getElementById("urls");
const qualityEl = document.getElementById("quality");
const cookiesEl = document.getElementById("use-cookies");
const errorEl = document.getElementById("url-error");
const helperEl = document.getElementById("helper-status");
const jobsEl = document.getElementById("jobs");

document.getElementById("download").addEventListener("click", onDownload);
document.getElementById("ping").addEventListener("click", onPing);
document.getElementById("clear").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clearJobs" });
  renderJobs([]);
});

qualityEl.addEventListener("change", saveSettings);
cookiesEl.addEventListener("change", saveSettings);

init();

async function init() {
  const state = await chrome.runtime.sendMessage({ type: "getState" });
  if (state?.quality) qualityEl.value = state.quality;
  cookiesEl.checked = Boolean(state?.useCookies);
  renderHelper(state?.helper);
  renderJobs(state?.jobs || []);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.jobs) renderJobs(changes.jobs.newValue || []);
  if (changes.helper) renderHelper(changes.helper.newValue);
});

async function saveSettings() {
  await chrome.storage.local.set({
    quality: qualityEl.value,
    useCookies: cookiesEl.checked,
  });
}

async function onDownload() {
  errorEl.hidden = true;
  const urls = parseUrlList(urlsEl.value);
  const invalid = urls.filter((url) => !isFacebookVideoUrl(url));
  if (invalid.length) {
    errorEl.hidden = false;
    errorEl.textContent = `Rejected (not a Facebook video URL): ${invalid[0]}`;
    if (!urls.some(isFacebookVideoUrl)) return;
  }

  await saveSettings();
  const result = await chrome.runtime.sendMessage({
    type: "download",
    urls,
    quality: qualityEl.value,
    useCookies: cookiesEl.checked,
  });
  if (!result?.ok) {
    errorEl.hidden = false;
    errorEl.textContent = result?.error || "Could not start download.";
    return;
  }
  if (result.rejected?.length) {
    errorEl.hidden = false;
    errorEl.textContent = `Queued ${result.queued}. Rejected ${result.rejected.length} non-video URL(s).`;
  }
}

async function onPing() {
  helperEl.textContent = "Checking native helper…";
  helperEl.className = "helper";
  const result = await chrome.runtime.sendMessage({ type: "ping" });
  renderHelper(result?.helper || { ok: result?.ok, error: result?.error });
}

function renderHelper(helper) {
  if (!helper) {
    helperEl.textContent = "Helper not checked yet. Click “Check helper” after installing the native host.";
    helperEl.className = "helper";
    return;
  }
  if (helper.ok) {
    helperEl.className = "helper ok";
    helperEl.textContent = `Helper ready${helper.ytDlp ? `: ${helper.ytDlp}` : ""}${
      helper.ffmpeg ? " (ffmpeg found)" : " (install ffmpeg so video+audio can merge)"
    }`;
    return;
  }
  helperEl.className = "helper bad";
  helperEl.textContent = helper.error || "Native helper is not connected.";
}

function renderJobs(jobs) {
  jobsEl.replaceChildren();
  for (const job of jobs) {
    const li = document.createElement("li");
    const statusClass =
      job.status === "done" ? "status-done" : job.status === "error" ? "status-error" : "";
    li.innerHTML = `
      <div class="url">${escapeHtml(job.url)}</div>
      <div class="meta">
        <span class="${statusClass}">${escapeHtml(job.message || job.status)}</span>
        <span>${job.status === "running" ? `${Math.round(job.progress || 0)}%` : job.status}</span>
      </div>
      <div class="bar"><span style="width:${Math.min(100, job.progress || 0)}%"></span></div>
      ${job.file ? `<div class="url">${escapeHtml(job.file)}</div>` : ""}
    `;
    jobsEl.appendChild(li);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
