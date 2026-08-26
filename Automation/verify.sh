#!/usr/bin/env bash
# M0a 검증 실행기.
#
# 설계 근거(실측):
#   - `--dump-dom` 은 load 이벤트 직후 덤프하고 프로세스를 끝낸다. requestAdapter/
#     requestDevice 같은 실제 GPU 대기는 그 전에 끝나지 않아 항상 PENDING 이 찍혔다.
#   - `--virtual-time-budget` 은 가상시간이 실제 GPU 대기보다 빨리 흘러 조기 만료된다.
#   => 그래서 덤프 대신 **페이지가 결과를 POST** 하고, 여기서는 결과 파일을 폴링한다.
#
# 서버(probe-server.mjs)는 기대 건수를 다 받으면 스스로 종료한다.
# 사용: bash Automation/verify.sh "<name>::<path>" ...
set -u
PORT=5183
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/Docs/m0a"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
PROFILE_BASE="/c/Users/USER/AppData/Local/Temp/m0a-chrome-profile"
N=$#

cd "$ROOT"
mkdir -p "$OUT"
for t in "$@"; do rm -f "$OUT/${t%%::*}.json"; done

node Automation/probe-server.mjs "$PORT" "$N" 180000 > "$OUT/probe-server.log" 2>&1 &
SRV=$!

kill_profile_chrome() {
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { \$_.CommandLine -like '*m0a-chrome-profile*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
}
cleanup() {
  kill_profile_chrome
  powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
  kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null
}
trap cleanup EXIT

for i in $(seq 1 80); do
  curl -s -o /dev/null "http://localhost:$PORT/probe.html" && break
  sleep 0.25
done
echo "server: $(head -1 "$OUT/probe-server.log")"

idx=0
for target in "$@"; do
  idx=$((idx+1))
  name="${target%%::*}"
  path="${target##*::}"
  sep="?"; case "$path" in *\?*) sep="&";; esac
  prof="${PROFILE_BASE}-${idx}"
  rm -rf "$prof"

  "$CHROME" --headless=new --no-sandbox --use-angle=d3d11 --enable-unsafe-webgpu \
    --no-first-run --no-default-browser-check --disable-extensions \
    --user-data-dir="$prof" --window-size=1280,720 \
    "http://localhost:$PORT${path}${sep}report=${name}" > "$OUT/$name.chrome.log" 2>&1 &

  ok=0
  for i in $(seq 1 120); do   # 최대 60초 폴링
    [ -s "$OUT/$name.json" ] && { ok=1; break; }
    sleep 0.5
  done
  kill_profile_chrome
  [ "$ok" = 1 ] && echo "OK   $name" || echo "MISS $name (결과 미수신)"
done

wait "$SRV" 2>/dev/null
cleanup; trap - EXIT
echo "--- server log ---"; cat "$OUT/probe-server.log"
