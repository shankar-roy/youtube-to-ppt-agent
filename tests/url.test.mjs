import { isFacebookVideoUrl, parseUrlList } from "../extension/url.js";
import assert from "node:assert/strict";

const accept = [
  "https://www.facebook.com/watch?v=1234567890",
  "https://facebook.com/watch?v=1234567890",
  "https://www.facebook.com/reel/1234567890",
  "https://www.facebook.com/reels/1234567890",
  "https://www.facebook.com/someone/videos/1234567890",
  "https://fb.watch/abcdEFG/",
  "https://www.facebook.com/share/v/abc123/",
  "https://www.facebook.com/share/r/abc123/",
  "https://m.facebook.com/watch/?v=99",
];

const reject = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://example.com/videos/1",
  "https://www.facebook.com/",
  "https://www.facebook.com/watch",
  "https://www.facebook.com/reels",
  "not a url",
  "ftp://www.facebook.com/watch?v=1",
];

for (const url of accept) {
  assert.equal(isFacebookVideoUrl(url), true, `should accept ${url}`);
}

for (const url of reject) {
  assert.equal(isFacebookVideoUrl(url), false, `should reject ${url}`);
}

assert.deepEqual(parseUrlList("a\nb, c"), ["a", "b", "c"]);
console.log("url tests passed", accept.length, "accepted,", reject.length, "rejected");
