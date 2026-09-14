#!/usr/bin/env python3
"""Send a native-messaging ping to host.py and print the pong."""

from __future__ import annotations

import json
import struct
import subprocess
import sys
from pathlib import Path

HOST = Path(__file__).resolve().parents[1] / "native-host" / "host.py"


def encode(message: dict) -> bytes:
    payload = json.dumps(message).encode("utf-8")
    return struct.pack("<I", len(payload)) + payload


def decode(stream) -> dict:
    header = stream.read(4)
    assert header, "host closed stdin without a reply"
    length = struct.unpack("<I", header)[0]
    payload = stream.read(length)
    return json.loads(payload.decode("utf-8"))


def main() -> int:
    proc = subprocess.Popen(
        [sys.executable, str(HOST)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdin and proc.stdout
    proc.stdin.write(encode({"type": "ping"}))
    proc.stdin.flush()
    reply = decode(proc.stdout)
    proc.stdin.close()
    proc.wait(timeout=5)
    print(json.dumps(reply, indent=2))
    if reply.get("type") != "pong":
        print("expected type=pong", file=sys.stderr)
        return 1
    # ok may be False when yt-dlp is missing; protocol still succeeded
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
