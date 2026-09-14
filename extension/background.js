import { isFacebookVideoUrl } from "./url.js";

const NATIVE_HOST = "com.facebookvideosaver";
const MAX_JOBS = 30;
const QUALITIES = new Set(["best", "720p", "480p"]);

let nativePort = null;
let processing = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ quality: "best", useCookies: false, jobs: [] }, (data) => {
    chrome.storage.local.set({
      quality: data.quality || "best",
      useCookies: Boolean(data.useCookies),
      jobs: Array.isArray(data.jobs) ? data.jobs : [],
    });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "download":
      return enqueueDownloads(message);
    case "getState":
      return getState();
    case "ping":
      return pingHost();
    case "clearJobs":
      await chrome.storage.local.set({ jobs: [] });
      return { ok: true };
    default:
      return { ok: false, error: "Unknown message type." };
  }
}

async function getState() {
  const data = await chrome.storage.local.get({
    quality: "best",
    useCookies: false,
    jobs: [],
    helper: null,
  });
  return { ok: true, ...data, processing };
}

async function enqueueDownloads(message) {
  const rawUrls = Array.isArray(message.urls) ? message.urls : [];
  const settings = await chrome.storage.local.get({ quality: "best", useCookies: false });
  const quality = QUALITIES.has(message.quality) ? message.quality : settings.quality || "best";
  const useCookies =
    typeof message.useCookies === "boolean" ? message.useCookies : Boolean(settings.useCookies);

  if (!rawUrls.length) {
    return { ok: false, error: "Paste at least one Facebook video URL." };
  }

  const accepted = [];
  const rejected = [];
  for (const raw of rawUrls) {
    const url = String(raw || "").trim();
    if (isFacebookVideoUrl(url)) accepted.push(url);
    else rejected.push(url);
  }

  if (!accepted.length) {
    return {
      ok: false,
      error: "No valid Facebook Watch, Reels, or video URLs. Non-Facebook links are rejected.",
      rejected,
    };
  }

  const now = Date.now();
  const newJobs = accepted.map((url) => ({
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    url,
    quality,
    useCookies,
    status: "queued",
    progress: 0,
    message: "Queued",
    file: "",
    createdAt: now,
    updatedAt: now,
  }));

  const { jobs = [] } = await chrome.storage.local.get({ jobs: [] });
  await chrome.storage.local.set({ jobs: [...newJobs, ...jobs].slice(0, MAX_JOBS) });
  processQueue();
  return { ok: true, queued: newJobs.length, rejected };
}

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    while (true) {
      const { jobs = [] } = await chrome.storage.local.get({ jobs: [] });
      const next = jobs.find((job) => job.status === "queued");
      if (!next) break;
      await runJob(next);
    }
  } finally {
    processing = false;
  }
}

function ensurePort() {
  if (nativePort) return nativePort;
  nativePort = chrome.runtime.connectNative(NATIVE_HOST);
  nativePort.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message;
    nativePort = null;
    if (error) {
      chrome.storage.local.set({ helper: { ok: false, error } });
    }
  });
  return nativePort;
}

function pingHost() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST);
    } catch (error) {
      const message = error.message || String(error);
      chrome.storage.local.set({ helper: { ok: false, error: message } });
      finish({ ok: false, error: message });
      return;
    }

    const timeout = setTimeout(() => {
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
      const error = "Native helper did not respond. Run native-host/install.sh and confirm yt-dlp is installed.";
      chrome.storage.local.set({ helper: { ok: false, error } });
      finish({ ok: false, error });
    }, 8000);

    port.onMessage.addListener((msg) => {
      if (msg?.type !== "pong") return;
      clearTimeout(timeout);
      const helper = {
        ok: Boolean(msg.ok),
        ytDlp: msg.ytDlp || "",
        ffmpeg: Boolean(msg.ffmpeg),
        error: msg.message || "",
      };
      chrome.storage.local.set({ helper });
      finish({ ok: helper.ok, helper });
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      clearTimeout(timeout);
      const error =
        chrome.runtime.lastError?.message ||
        "Could not connect to the native helper. Load the unpacked extension, then run native-host/install.sh.";
      chrome.storage.local.set({ helper: { ok: false, error } });
      finish({ ok: false, error });
    });

    port.postMessage({ type: "ping" });
  });
}

function runJob(job) {
  return new Promise((resolve) => {
    updateJob(job.id, { status: "running", message: "Starting download…", progress: 0 });

    let port;
    try {
      port = ensurePort();
    } catch (error) {
      const message = error.message || String(error);
      updateJob(job.id, { status: "error", message }).then(resolve);
      return;
    }

    const onMessage = (msg) => {
      if (!msg || msg.id !== job.id) return;
      if (msg.type === "progress") {
        updateJob(job.id, {
          status: "running",
          progress: typeof msg.percent === "number" ? msg.percent : job.progress,
          message: msg.message || "Downloading…",
        });
        return;
      }
      if (msg.type === "done") {
        cleanup();
        updateJob(job.id, {
          status: "done",
          progress: 100,
          message: "Saved",
          file: msg.file || "",
        }).then(resolve);
        return;
      }
      if (msg.type === "error") {
        cleanup();
        updateJob(job.id, {
          status: "error",
          message: msg.message || "Download failed.",
        }).then(resolve);
      }
    };

    const onDisconnect = () => {
      cleanup();
      const message =
        chrome.runtime.lastError?.message ||
        "Native helper disconnected. Is yt-dlp installed and native-host/install.sh completed?";
      updateJob(job.id, { status: "error", message }).then(resolve);
    };

    function cleanup() {
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
    }

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    port.postMessage({
      type: "download",
      id: job.id,
      url: job.url,
      quality: job.quality,
      useCookies: job.useCookies,
    });
  });
}

async function updateJob(id, patch) {
  const { jobs = [] } = await chrome.storage.local.get({ jobs: [] });
  const next = jobs.map((job) =>
    job.id === id ? { ...job, ...patch, updatedAt: Date.now() } : job
  );
  await chrome.storage.local.set({ jobs: next });
}
