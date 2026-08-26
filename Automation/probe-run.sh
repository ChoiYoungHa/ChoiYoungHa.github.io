#!/usr/bin/env bash
# M0a 검증용 1회성 실행기: vite dev 기동 -> 헤드리스 Chrome 덤프 -> 서버 강제 종료.
# WORKER_DIRECTIVE §1: 서버는 단일 인스턴스, 작업 직후 반드시 종료하고 종료를 실측한다.
set -u
PORT=5183
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/Docs/m0a"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
PROFILE="/c/Users/USER/AppData/Local/Temp/m0a-chrome-profile"

cd "$ROOT"
mkdir -p "$OUT"

npx vite --port "$PORT" --strictPort > "$OUT/vite-dev.log" 2>&1 &
VITE_PID=$!
trap 'kill "$VITE_PID" 2>/dev/null; wait "$VITE_PID" 2>/dev/null' EXIT

# 포트 대기 (최대 60초)
for i in $(seq 1 120); do
  if curl -s -o /dev/null "http://localhost:$PORT/"; then break; fi
  sleep 0.5
done
if ! curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "SERVER_NOT_UP"; exit 1
fi
echo "server up (pid $VITE_PID)"

dump() { # $1=path  $2=outfile
  rm -rf "$PROFILE"
  "$CHROME" --headless=new --disable-gpu-sandbox --no-first-run --no-default-browser-check \
    --user-data-dir="$PROFILE" --virtual-time-budget=20000 --window-size=1280,720 \
    --dump-dom "http://localhost:$PORT$1" > "$2" 2>"$2.err"
  echo "dumped $1 -> $2 ($(wc -c < "$2") bytes)"
}

for target in "$@"; do
  name="${target%%::*}"
  path="${target##*::}"
  dump "$path" "$OUT/$name.html"
done

kill "$VITE_PID" 2>/dev/null
wait "$VITE_PID" 2>/dev/null
trap - EXIT
echo "server killed"
