const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "mbasic.facebook.com",
  "web.facebook.com",
  "l.facebook.com",
  "lm.facebook.com",
  "fb.watch",
  "www.fb.watch",
  "fb.com",
  "www.fb.com",
]);

export function parseHttpUrl(raw) {
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function isFacebookHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (FACEBOOK_HOSTS.has(host)) return true;
  return host.endsWith(".facebook.com") || host.endsWith(".fb.watch") || host.endsWith(".fb.com");
}

export function isFacebookVideoUrl(raw) {
  const url = parseHttpUrl(raw);
  if (!url || !isFacebookHost(url.hostname)) return false;

  const host = url.hostname.toLowerCase();
  const path = url.pathname || "/";
  const lower = path.toLowerCase();
  const parts = path.split("/").filter(Boolean);

  if (host === "fb.watch" || host.endsWith(".fb.watch")) {
    return parts.length >= 1;
  }

  const videoId = url.searchParams.get("v");
  if (videoId) return true;

  if (/\/reel(s)?\/[^/]+/i.test(lower)) return true;
  if (/\/videos\/[^/]+/i.test(lower)) return true;
  if (/\/watch\/.+/i.test(lower)) return true;
  if (/\/share\/(v|r)\/[^/]+/i.test(lower)) return true;
  if (/\/story\.php/i.test(lower) && url.searchParams.has("story_fbid")) return true;

  return false;
}

export function parseUrlList(text) {
  return String(text || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
