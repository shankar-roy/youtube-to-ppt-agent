#!/usr/bin/env python3
"""Chrome native messaging host: download Facebook video URLs with yt-dlp."""

from __future__ import annotations

import json
import os
import re
import shutil
import struct
import subprocess
import sys
import threading
from pathlib import Path

ALLOWED_QUALITIES = {
    "best": "bv*+ba/b",
    "720p": "bv*[height<=720]+ba/b[height<=720]/wv*+ba/w",
    "480p": "bv*[height<=480]+ba/b[height<=480]/wv*+ba/w",
}
PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)%")
DEFAULT_DIR = Path.home() / "Downloads" / "FacebookVideos"
OUTPUT_TEMPLATE = "%(title).80s-%(id)s.%(ext)s"
YTDLP_CANDIDATES = (
    shutil.which("yt-dlp"),
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    str(Path.home() / ".local/bin/yt-dlp"),
)
FFMPEG_CANDIDATES = (
    shutil.which("ffmpeg"),
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
)


_WRITE_LOCK = threading.Lock()


def find_executable(candidates):
    for path in candidates:
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    if len(raw_length) < 4:
        return None
    length = struct.unpack("<I", raw_length)[0]
    payload = sys.stdin.buffer.read(length)
    if len(payload) < length:
        return None
    return json.loads(payload.decode("utf-8"))


def send_message(message):
    encoded = json.dumps(message).encode("utf-8")
    with _WRITE_LOCK:
        sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()


def ping():
    yt_dlp = find_executable(YTDLP_CANDIDATES)
    ffmpeg = find_executable(FFMPEG_CANDIDATES)
    if not yt_dlp:
        send_message(
            {
                "type": "pong",
                "ok": False,
                "ytDlp": "",
                "ffmpeg": bool(ffmpeg),
                "message": "yt-dlp not found. Install with: brew install yt-dlp",
            }
        )
        return
    send_message(
        {
            "type": "pong",
            "ok": True,
            "ytDlp": yt_dlp,
            "ffmpeg": bool(ffmpeg),
            "message": "" if ffmpeg else "ffmpeg not found; audio/video merge may fail. brew install ffmpeg",
        }
    )


def download(message):
    job_id = message.get("id") or ""
    url = (message.get("url") or "").strip()
    quality = message.get("quality") or "best"
    use_cookies = bool(message.get("useCookies"))
    output_dir = Path(message.get("outputDir") or DEFAULT_DIR).expanduser()

    if not url:
        send_message({"type": "error", "id": job_id, "message": "Missing URL."})
        return
    if quality not in ALLOWED_QUALITIES:
        send_message({"type": "error", "id": job_id, "message": f"Unsupported quality: {quality}"})
        return

    yt_dlp = find_executable(YTDLP_CANDIDATES)
    if not yt_dlp:
        send_message(
            {
                "type": "error",
                "id": job_id,
                "message": "yt-dlp not found. Install with: brew install yt-dlp",
            }
        )
        return

    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        send_message({"type": "error", "id": job_id, "message": f"Cannot create output folder: {exc}"})
        return

    ffmpeg = find_executable(FFMPEG_CANDIDATES)
    cmd = [
        yt_dlp,
        "--no-playlist",
        "--newline",
        "--no-color",
        "--merge-output-format",
        "mp4",
        "-f",
        ALLOWED_QUALITIES[quality],
        "-o",
        str(output_dir / OUTPUT_TEMPLATE),
        "--print",
        "after_move:filepath",
    ]
    if ffmpeg:
        cmd.extend(["--ffmpeg-location", str(Path(ffmpeg).parent)])
    if use_cookies:
        cmd.extend(["--cookies-from-browser", "chrome"])
    cmd.append(url)

    send_message({"type": "progress", "id": job_id, "percent": 0, "message": "Starting yt-dlp…"})

    env = os.environ.copy()
    extra_path = ["/opt/homebrew/bin", "/usr/local/bin", str(Path.home() / ".local/bin")]
    env["PATH"] = os.pathsep.join(extra_path + [env.get("PATH", "")])

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )

    log_lines = []

    def read_progress():
        assert proc.stderr is not None
        for line in proc.stderr:
            text = line.strip()
            if not text:
                continue
            log_lines.append(text)
            if len(log_lines) > 80:
                del log_lines[:-80]
            match = PERCENT_RE.search(text)
            if match and "[download]" in text:
                percent = min(99.0, float(match.group(1)))
                send_message(
                    {
                        "type": "progress",
                        "id": job_id,
                        "percent": percent,
                        "message": text[:240],
                    }
                )
            elif text.startswith("[Merger]") or text.startswith("[ExtractAudio]"):
                send_message(
                    {
                        "type": "progress",
                        "id": job_id,
                        "percent": 95,
                        "message": text[:240],
                    }
                )

    progress_thread = threading.Thread(target=read_progress, daemon=True)
    progress_thread.start()
    assert proc.stdout is not None
    stdout = proc.stdout.read()
    proc.wait()
    progress_thread.join(timeout=2)
    code = proc.returncode

    last_path = ""
    for line in (stdout or "").splitlines():
        text = line.strip()
        if text and not text.startswith("["):
            last_path = text

    if code != 0:
        tail = "\n".join(log_lines[-20:]) or f"yt-dlp exited with code {code}"
        send_message({"type": "error", "id": job_id, "message": tail[-2000:]})
        return

    send_message({"type": "done", "id": job_id, "file": last_path, "message": "Saved"})


def main():
    while True:
        try:
            message = read_message()
        except Exception as exc:  # noqa: BLE001 — report parse errors to the extension
            send_message({"type": "error", "id": "", "message": f"Invalid native message: {exc}"})
            continue
        if message is None:
            break
        msg_type = message.get("type")
        if msg_type == "ping":
            ping()
        elif msg_type == "download":
            download(message)
        else:
            send_message(
                {
                    "type": "error",
                    "id": message.get("id") or "",
                    "message": f"Unknown request: {msg_type}",
                }
            )


if __name__ == "__main__":
    main()
