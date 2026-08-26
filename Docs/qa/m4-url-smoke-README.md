# M4 배포 URL smoke · 최종 low 측정 실행서

이 문서는 M4-20 배포 URL이 생긴 직후 M4-21·M4-22를 재현하고, 이어서 M4-23A·M4-23B의 3회 측정 CSV를 채우는 실행 계약이다. 현재 라운드에서는 배포 URL·헤드리스 브라우저·GPU를 사용하지 않았고 --dry-run까지만 검증했다.

## 배포 후 실행 순서 3줄

PowerShell에서 $smokeDeployUrl에 M4-20의 HTTPS URL을 넣은 다음 순서대로 실행한다.

1. WebGPU — node Automation/url-smoke.mjs --url $smokeDeployUrl --walk 60 --out Docs/qa/m4-webgpu.json
2. WebGL2 — node Automation/url-smoke.mjs --url $smokeDeployUrl --gl webgl --walk 60 --out Docs/qa/m4-webgl2.json
3. low 3회 — node Automation/run-bench.mjs --skip-build --runs 3 --warmup 30 --output Docs/perf/m4-low-runs.raw.csv

3번은 최종 통합 dist와 그 HEAD를 먼저 확인한 뒤 실행한다. run-bench 결과를 아래 열 규약으로 정규화해 Docs/perf/m4-low-runs.csv에 넣고, js_heap_mb에는 같은 행의 jsHeapPeakMB 값을 복제한다. processRAMGB는 Docs/perf/process-ram-howto.md의 수동 측정값으로 별도 보완한다.

## dry-run 검증

--dry-run은 URL을 요청하지 않고 Chrome도 띄우지 않는다. 이번 라운드의 실제 출력은 다음과 같았다.

~~~json
{
  "dryRun": true,
  "targetUrl": "https://deployment.invalid/?q=low&route=bench",
  "options": {
    "backend": "WebGPU",
    "forceWebGL": false,
    "walkSeconds": 60
  },
  "output": "Docs/qa/m4-webgpu.json",
  "headPreflight": "skipped",
  "browserLaunch": false
}
~~~

WebGL2 dry-run은 target URL에 gl=webgl이 추가되고 backend=WebGL2, forceWebGL=true, output=Docs/qa/m4-webgl2.json으로 바뀐다.

## 러너 계약

    node Automation/url-smoke.mjs --url <https://…> [--gl webgl] [--walk 60] --out <json> [--dry-run]

- --url과 --out은 필수이고 배포 URL은 절대 HTTPS URL이어야 한다.
- 현재 결정론적 bench route가 60초 고정이므로 --walk은 60만 허용한다.
- 실제 실행은 입력 URL에 q=low&route=bench를 추가하며, WebGL2 경로만 gl=webgl을 추가한다.
- 브라우저 실행 전에 입력 URL로 fetch(..., { method: "HEAD" })를 보내 최종 HTTP status 200을 요구한다.
- window.__bench의 기존 60초 route/perf/error 페이로드를 읽고, HUD에서 backend·forceWebGL·ANGLE을 읽는다.
- CDP Runtime.consoleAPICalled·Runtime.exceptionThrown·Log.entryAdded를 수집해 console error와 shader/WGSL/GLSL compile·link error 수를 분리한다.
- 기존 bench error collector 검증용 m0b-intentional-rejection 1건은 run-bench와 동일하게 오류 합계에서 제외한다.
- backend·forceWebGL·HTTP 200·60초 이동·유한한 finalPosition·shader/console/runtime error 0을 모두 만족해야 exit 0이다.

## 산출물과 로드맵 매핑

| 산출 파일 | 로드맵 행 | 완료 판정 |
|---|---|---|
| Docs/qa/m4-webgpu.json | M4-21 | backend=WebGPU, forceWebGL=false, 60초 finalPosition 존재, shader/console/runtime error 0 |
| Docs/qa/m4-webgl2.json | M4-22 | backend=WebGL2, forceWebGL=true, 60초 finalPosition 존재, shader/console/runtime error 0 |
| Docs/perf/m4-low-runs.csv | M4-23A | low·동일 build hash·동일 routeHash의 실측 3행과 중앙값 행 |
| Docs/perf/m4-low-runs.csv의 js_heap_mb | M4-23B | 3개 숫자와 중앙값 ≤900MB, 각 값은 jsHeapPeakMB와 동일 |

## run-bench 재사용과 복제 범위

새 러너는 앱의 기존 ?route=bench, window.__bench, routeHash, finalPosition, perf, errors 계약을 그대로 재사용한다. run-bench.mjs가 export하는 공용 함수는 parseBenchArgs와 assertExistingDist뿐이라 원격 URL 러너에 필요한 Chrome 탐색·CDP 연결·종료 함수는 import할 수 없었다. 따라서 Chrome 표준 경로 탐색, 최소 headless 인자, DevToolsActivePort/CDP 요청, 프로세스·임시 profile 정리만 좁게 복제했고, preview 서버·빌드·CSV 집계 로직은 복제하지 않았다.

## CSV 열 차이

현재 run-bench.mjs의 CSV_COLUMNS는 다음 17개다.

    run,date,build_hash,backend,angle,preset,routeHash,avg_fps,low1_fps,hitch_1s,calls,programs,textureGpuMB,jsHeapPeakMB,processRAMGB,crash,errors

M4-23B 완료 조건은 js_heap_mb라는 snake_case 열을 요구하므로 템플릿은 위 17개 뒤에 이 별칭을 하나 더 둔다. jsHeapPeakMB는 이미 60초 구간의 peak JS heap을 내므로 새 측정을 중복 수행하지 않고 같은 숫자를 js_heap_mb에 복제한다. run-bench가 직접 쓰는 raw CSV에는 이 별칭이 없으므로 raw 파일을 증거로 보존하고 최종 파일의 두 열이 행별로 같은지 확인한다.

## 현재 보류

- Docs/qa/m4-webgpu.json과 Docs/qa/m4-webgl2.json은 M4-20 URL 생성 후 실제 실행해야 생긴다.
- 배포 HTTPS에 대한 HEAD 200, 원격 자산 로드, WebGPU/WebGL2 backend와 GPU 성능은 아직 확인하지 않았다.
- 현재 템플릿은 측정 결과가 아니므로 M4-21·22·23A·23B 로드맵 행을 완료 처리하지 않는다.
