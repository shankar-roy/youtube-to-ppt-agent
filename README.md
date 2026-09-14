# Facebook Video Saver

Personal Chrome/Edge extension that downloads **Facebook Watch, Reels, and video permalinks you paste** (or the video page you already have open). A small local helper runs [yt-dlp](https://github.com/yt-dlp/yt-dlp) so DASH/HLS streams can be merged into an `.mp4` on your Mac.

This is not a Facebook search tool. It does not scrape the feed, bypass logins, or send URLs to a server.

## Use only content you have the right to save

Facebook’s terms restrict downloading in many cases. Use this for videos you own or are otherwise allowed to keep. Copyright still applies.

## What you need

- Google Chrome or Microsoft Edge (Manifest V3)
- Python 3
- [Homebrew](https://brew.sh) tools:

```bash
brew install yt-dlp ffmpeg
```

ffmpeg is required so separate video and audio tracks can merge into one file.

## Install

1. Clone or copy this folder, then register the native helper (uses a stable unpacked extension ID from `extension/manifest.json`):

```bash
chmod +x native-host/install.sh native-host/host.py
./native-host/install.sh
```

If Chrome shows a **different** ID on `chrome://extensions` (Developer mode → ID), pass it explicitly:

```bash
./native-host/install.sh YOUR_EXTENSION_ID
```

2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `extension` directory.

3. Pin the extension, open the popup, click **Check helper**. You should see the yt-dlp path. If the helper is missing, reload the extension after `install.sh`.

Default output folder: `~/Downloads/FacebookVideos`.

## How to download

- **Popup:** paste one or more Facebook video URLs (Watch `?v=`, `/reel/`, `/videos/`, `fb.watch`, or `/share/v/` links). Choose Best / 720p / 480p. Click **Download**.
- **On Facebook:** open a Watch, Reels, or video permalink. Use the **Download video** button at the bottom-right. It sends that page URL to the same queue.
- **Login-walled videos:** enable **Use my Chrome cookies** only for clips you can already watch while logged in. yt-dlp reads Chrome’s cookie store on this Mac (`--cookies-from-browser chrome`). Default is off. Do not use this to access other people’s private videos.

Non-Facebook URLs are rejected.

Failures (private, geo-blocked, expired, missing yt-dlp) show yt-dlp’s error text in the popup instead of failing silently.

## Layout

- `extension/` — Manifest V3 popup, service worker, content script
- `native-host/host.py` — Chrome native messaging host
- `native-host/install.sh` — copies the host manifest into Chrome/Edge/Brave NativeMessagingHosts

## Checks you can run without Chrome

```bash
node tests/url.test.mjs
python3 tests/test_host_ping.py
```

A full download needs a public Facebook video URL you are allowed to save, plus Chrome with the extension and helper installed.

## Uninstall

Remove the unpacked extension in `chrome://extensions`. Delete:

`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.facebookvideosaver.json`

(and the same file under Edge/Brave if those were installed).
