# D-1 제출 증거 인덱스

- 실측 시각: `2026-08-26T20:27:33.7246352+09:00`
- build hash: `0f5c2c1`
- 실측 방법: 저장소 루트에서 각 경로를 Node `fs.existsSync`로 검사
- 범위: `로드맵.md §5 마감 D-1 우선순위`의 11개 행

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

## 합계

- 경로: **25개 중 존재 22개, 부재 3개**
- D-1 우선순위 행: **11개 중 완비 8개, 미완비 3개**
- 부재 증거: production 배포 로그, 공개 URL 검증, M0a 최종 GATE 문서

파일 존재는 해당 완료 조건의 PASS와 같지 않다. 특히 `wrangler-help.txt`가 있어도 production 배포 로그가 없으므로 M0a-11·12 묶음은 미완비다.
