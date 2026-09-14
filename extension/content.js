import { isFacebookVideoUrl } from "./url.js";

const ROOT_ID = "fvs-download-root";

function currentHref() {
  return window.location.href;
}

function ensureButton() {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "fvs-download-btn";
    button.textContent = "Download video";
    button.addEventListener("click", async () => {
      button.disabled = true;
      const original = button.textContent;
      button.textContent = "Queuing…";
      try {
        const result = await chrome.runtime.sendMessage({
          type: "download",
          urls: [currentHref()],
        });
        button.textContent = result?.ok ? "Queued" : result?.error || "Failed";
      } catch (error) {
        button.textContent = error.message || "Failed";
      }
      setTimeout(() => {
        button.disabled = false;
        button.textContent = original;
        syncVisibility();
      }, 1800);
    });
    root.appendChild(button);
    document.documentElement.appendChild(root);
  }
  return root;
}

function syncVisibility() {
  const root = ensureButton();
  root.hidden = !isFacebookVideoUrl(currentHref());
}

let lastHref = currentHref();
syncVisibility();

setInterval(() => {
  if (!document.getElementById(ROOT_ID)) ensureButton();
  if (currentHref() !== lastHref) {
    lastHref = currentHref();
  }
  syncVisibility();
}, 800);

document.addEventListener("click", () => {
  requestAnimationFrame(syncVisibility);
});
