# M3 actual build · 15분 smoke

- 측정일: 2026-08-26
- HEAD/build hash: `87ee4d6`
- build mode: `first-run-build-once+reuse-dist`
- 조건: actual build, 1280×720 `low`, `?route=bench`, 30초 워밍업

## 실행 결과

| 단계 | 명령 요약 | exit | 결과 |
|---|---|---:|---|
| production build + WebGPU 3회 | `run-bench --build-once --runs 3 --warmup 30` | 0 | build 1회, 측정 PASS, port 4173 cleanup PASS |
| WebGL2 3회 | `run-bench --skip-build --runs 3 --warmup 30 --gl webgl` | 0 | dist 재사용, 측정 PASS, port 4173 cleanup PASS |
| 900초 soak | `run-bench --skip-build --warmup 30 --soak 900` | 0 | port 4173 cleanup PASS |

두 3회 CSV의 build hash는 `87ee4d6`, routeHash는 `m0b-bench-v3-mainpath`로 모두 같다. bench report의 crash·errors는 모든 run에서 0이다.

## M3-20 판정

`Docs/qa/m3-15min.md` 실측은 requested 900s, elapsed **914.66s**, 14 cycles, WebGPU, crash **0**, TDR **0**, context-lost **0**, errors **0**, result **PASS**다. 따라서 M3-20 완료 조건인 15분 crash=0·console error=0은 **PASS**다.

Chrome stderr에 Google GCM `DEPRECATED_ENDPOINT`가 있었지만 앱 page report의 console/runtime errors는 0이며 서로 분리해 기록한다. soak 문서 제목이 생성기 호환 때문에 `M0b-25`로 남아도 파일 경로와 build hash가 M3 측정을 식별한다.

## 최종 build 룩 캡처

`m3-gate-1/2/3.png`는 같은 dist에서 WebGPU·low·1280×720·runtime error 0으로 캡처했다. 첫 `vista-village` 캡처가 전흑(20,831 bytes)이어서 실패 증거를 Temp `r45c-artifacts-87ee4d6`에 격리하고 재캡처했으며, 채택본은 정상 HDR 장면 556,568 bytes다.

## 종료 정리 실측

측정 종료 뒤 listen port 5173/4173/5183은 0개, R45-C headless Chrome 프로필·자동화 프로세스는 0개, `run-bench`·`probe-server`·`vite preview` 관련 Node 프로세스는 0개다. 영하님 일반 Chrome은 종료하거나 변경하지 않았다.
