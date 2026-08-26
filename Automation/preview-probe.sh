#!/usr/bin/env bash
# 빌드 산출물(dist)을 vite preview 로 띄우고 헤드리스 Chrome 으로 덤프한 뒤 반드시 종료한다.
# WORKER_DIRECTIVE §1: 단일 인스턴스 · 직후 종료 · 종료 실측.
set -u
PORT=5183
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/Docs/m0a"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
PROFILE="/c/Users/USER/AppData/Local/Temp/m0a-chrome-profile"

cd "$ROOT"
mkdir -p "$OUT"

npx vite preview --port "$PORT" --strictPort > "$OUT/vite-preview.log" 2>&1 &
WRAP_PID=$!

cleanup() {
  # npx 래퍼가 아니라 포트를 물고 있는 실제 node 를 죽인다 (Windows)
  powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
  kill "$WRAP_PID" 2>/dev/null
  wait "$WRAP_PID" 2>/dev/null
}
trap cleanup EXIT

for i in $(seq 1 120); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.5
done
curl -s -o /dev/null "http://localhost:$PORT/" || { echo "SERVER_NOT_UP"; exit 1; }
echo "preview up"

dump() {
  rm -rf "$PROFILE"
  "$CHROME" --headless=new --no-first-run --no-default-browser-check \
    --user-data-dir="$PROFILE" --virtual-time-budget=30000 --window-size=1280,720 \
    --enable-logging=stderr --v=0 \
    --dump-dom "http://localhost:$PORT$1" > "$2" 2>"$2.err"
  echo "dump $1 -> $(basename "$2") ($(wc -c < "$2") bytes)"
}

for target in "$@"; do
  name="${target%%::*}"
  path="${target##*::}"
  dump "$path" "$OUT/$name.html"
done

cleanup
trap - EXIT
echo "preview killed"
