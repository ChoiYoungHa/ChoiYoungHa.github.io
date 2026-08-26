#!/usr/bin/env bash
# 헤드리스 Chrome 플래그 조합별로 probe.html 결과를 비교한다. 서버 1회만 띄우고 끝나면 죽인다.
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
  powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
  kill "$WRAP_PID" 2>/dev/null; wait "$WRAP_PID" 2>/dev/null
}
trap cleanup EXIT
for i in $(seq 1 120); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.5; done
curl -s -o /dev/null "http://localhost:$PORT/" || { echo SERVER_NOT_UP; exit 1; }
echo "preview up"

run() { # $1=label  $2=extra flags
  rm -rf "$PROFILE"
  # shellcheck disable=SC2086
  "$CHROME" --headless=new --no-first-run --no-default-browser-check \
    --user-data-dir="$PROFILE" --virtual-time-budget=30000 --window-size=1280,720 \
    $2 --dump-dom "http://localhost:$PORT/probe.html" > "$OUT/flag-$1.html" 2>/dev/null
  echo "--- [$1] flags: $2"
  sed -n 's/.*<pre id="out">\(.*\)<\/pre>.*/\1/p' "$OUT/flag-$1.html" \
    | py -c "import sys,html;print(html.unescape(sys.stdin.read())[:600])"
}

run "A-default"   ""
run "B-nosandbox" "--no-sandbox --disable-gpu-sandbox"
run "C-angle"     "--no-sandbox --use-angle=d3d11 --enable-unsafe-webgpu"
run "D-disablegpu" "--disable-gpu"

cleanup; trap - EXIT; echo "preview killed"
