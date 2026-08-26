# D-1 제출 증거 인덱스

- 실측 시각: `2026-08-26T22:58:43.549+09:00`
- build hash: `999a708`(`wt/bench`, main 병합 HEAD)
- 실측 방법: worktree 루트 `C:\Users\USER\Desktop\claude\해커톤\web3d-wt-codexA`에서 각 경로를 Node `fs.existsSync`로 검사
- 범위: `로드맵.md §5 마감 D-1 우선순위`의 11개 행 + M3 룩 증거 1개 행 + M3-GATE 증거 1개 행 + 룩 변형·M4-14·M4-16 증거 1개 행

| 순서 | ID | 실제 증거 경로와 존재 여부 | 행 완비 |
|---:|---|---|---|
| 1 | M0a-01 | `package.json` ✅ · `Docs/m0a/tool-versions.txt` ✅ | ✅ |
| 2 | M0a-02 | `package.json` ✅ · `package-lock.json` ✅ | ✅ |
| 3 | M0a-03 | `Docs/m0a/npm-ls.txt` ✅ · `Docs/m0a/tsc.txt` ✅ | ✅ |
| 4 | M0a-04,M0a-05 | `src/gl/createRenderer.ts` ✅ · `Docs/m0a/m0a04-webgpu.json` ✅ · `src/App.tsx` ✅ · `Docs/m0a/m0a05-app-webgpu.json` ✅ | ✅ |
| 5 | M0a-06,M0a-07 | `Docs/m0a/m0a06-webgl.json` ✅ · `src/systems/RuntimeHud.tsx` ✅ · `Docs/m0a/backends.json` ✅ · `Docs/m0a/m0a07-webgpu.png` ✅ · `Docs/m0a/m0a07-webgl.png` ✅ | ✅ |
| 6 | M0a-08 | `src/scene/Prototype.tsx` ✅ | ✅ |
| 7 | M0a-09 | `src/player/Controller.tsx` ✅ · `src/player/controllers/raycast.ts` ✅ · `src/player/FollowCamera.tsx` ✅ · `Docs/m0a/walk-check.json` ✅ | ✅ |
| 8 | M0a-10 | `Docs/perf/m0a-preview.csv` ✅ | ✅ |
| 9 | M0a-11,M0a-12 | `Docs/deploy/wrangler-help.txt` ✅ · `Docs/deploy/production.txt` ❌ | ❌ |
| 10 | M0a-13 | `Docs/deploy/m0a-url.txt` ❌ | ❌ |
| 11 | M0a-GATE | `Docs/decisions/m0a-gate.md` ❌ | ❌ |
| 12 | M3-01,M3-14,M3-19D | `Docs/lookdev/l1-l5-decision.json` ✅ · `Docs/lookdev/m3-tonemap.md` ✅<br>`Docs/lookdev/m3-before-1-metrics.json` ✅ · `Docs/lookdev/m3-before-2-metrics.json` ✅ · `Docs/lookdev/m3-before-3-metrics.json` ✅<br>`Docs/lookdev/m3-after-1-metrics.json` ✅ · `Docs/lookdev/m3-after-2-metrics.json` ✅ · `Docs/lookdev/m3-after-3-metrics.json` ✅<br>`Docs/lookdev/m3-before-1.png` ✅ · `Docs/lookdev/m3-before-2.png` ✅ · `Docs/lookdev/m3-before-3.png` ✅<br>`Docs/lookdev/m3-after-1.png` ✅ · `Docs/lookdev/m3-after-2.png` ✅ · `Docs/lookdev/m3-after-3.png` ✅ · `Docs/lookdev/m3-after-1-bw.png` ✅<br>`Docs/qa/m3-l4-s3.json` ✅ | ✅ |
| 13 | M3-GATE,M3-20 | `Docs/decisions/m3-gate.md` ✅ · `Docs/perf/m3-runs.csv` ✅ · `Docs/perf/m3-webgl-runs.csv` ✅<br>`Docs/perf/m3-delta.md` ✅ · `Docs/qa/m3-15min.md` ✅ · `Docs/qa/m3-smoke.md` ✅<br>`Docs/lookdev/m3-gate-1-metrics.json` ✅ · `Docs/lookdev/m3-gate-2-metrics.json` ✅ · `Docs/lookdev/m3-gate-3-metrics.json` ✅ | ✅ |
| 14 | R64-A,R67-A,M4-14,M4-16 | `Docs/lookdev/variants/variants-result.md` ✅ · `Docs/lookdev/variants/variants-result.json` ✅<br>`Docs/lookdev/variants-adopted/variants-result.md` ✅ · `Docs/lookdev/variants-adopted/variants-result.json` ✅<br>`Docs/perf/m4-grasslite-bench.csv` ✅ · `Docs/qa/m4-check-budgets-final.txt` ✅<br>`Docs/qa/m4-build-gate.txt` ✅ · `Docs/qa/m4-build-gate-fail.txt` ✅ | ✅ |

## 합계

- 검사 항목: **58개 중 존재 55개, 부재 3개**(기존 D-1 25개 중 22개 존재 + M3 룩 16개 중 16개 존재 + M3-GATE 9개 중 9개 존재 + 룩 변형·M4-14·16 8개 중 8개 존재)
- 전체 행: **14개 중 완비 11개, 미완비 3개**
- D-1 우선순위 행: **11개 중 완비 8개, 미완비 3개**; M3·M4 추가 행: **3개 중 완비 3개**
- 부재 증거: production 배포 로그, 공개 URL 검증, M0a 최종 GATE 문서

파일 존재는 해당 완료 조건의 PASS와 같지 않다. 특히 `wrangler-help.txt`가 있어도 production 배포 로그가 없으므로 M0a-11·12 묶음은 미완비다.

M3 룩 16개와 M3-GATE 9개 증거는 모두 존재한다. `m3-gate.md`의 master 절은 자동 지표·룩 5/5 PASS와 프로세스 RAM 보류를 근거로 **조건부 PASS**, tag `v0.3.0-m3`를 기록한다.

룩 변형·grassLite 채택·M4-14·M4-16 신규 증거 8개도 모두 존재한다. M4-14는 preset별 tris 한도로 exit 0, M4-16은 정상 전체 체인 exit 0과 고의 미등록 GLB exit 1을 각각 증명한다.

## 부재 3건 해소 경로

| 부재 경로 | 생성 로드맵 행 | 선행 조건 | 담당 |
|---|---|---|---|
| `Docs/deploy/production.txt` | **M4-20** Wrangler production 배포 | M4-16 통합 빌드 게이트 완료, M4-17 명령 확인, M4-18 Pages 프로젝트 생성·로그인, M4-19 캐시 헤더 반영 | 워커: actual build·deploy·URL/HTTP 200 로그 저장; 영하님: Cloudflare 로그인·계정/프로젝트 권한 승인 |
| `Docs/deploy/m0a-url.txt` | **M0a-13** 공개 URL 검증 | M0a-12 또는 현재 대체 행 M4-20의 production URL 확보 | 워커: 기본 URL과 `?gl=webgl` HTTP/HUD·걷기 결과 기록; 영하님: 실 브라우저 접근과 조작 확인 |
| `Docs/decisions/m0a-gate.md` | **M0a-GATE** 제출 게이트 | M0a-03 버전·TS, M0a-07 두 backend 증거, M0a-13 또는 M0a-14 URL 증거 완비 | 워커: 근거 취합·게이트 초안 작성; 영하님: 공개 URL 실접근 확인; master: 최종 PASS/No-Go 판정 |

현재 Dispatch는 배포·브라우저·빌드 권한이 없으므로 위 파일을 빈 증거로 만들지 않는다. 각 담당자가 완료 조건을 실제로 실행한 뒤 결과를 기록해야 한다.
