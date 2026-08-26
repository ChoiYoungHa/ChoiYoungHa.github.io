# M4-23B JS heap 선행 근거

M2 low WebGPU 3회 측정 파일 `Docs/perf/m2-runs.csv`의 `jsHeapPeakMB` 열을 재사용해 열 규약과 예산 판정 근거를 준비했다. 기존 camelCase 열 `jsHeapPeakMB`는 M4 완료 조건의 표준 열 이름 `js_heap_mb`와 같은 단위(MB)의 같은 지표로 대응한다.

| run | jsHeapPeakMB | 예산 ≤900MB |
|---:|---:|---|
| 1 | 119.53 | PASS |
| 2 | 193.07 | PASS |
| 3 | 200.59 | PASS |
| 중앙값 | **193.07** | **PASS** |

세 값은 모두 숫자이며 중앙값 `193.07MB`는 `900MB` 이하이다. 다만 M4-23A의 M4 actual build 최종 측정 전이므로 이 문서는 스키마·과거 근거만 제공하며 M4-23B 완료 판정이나 로드맵 체크를 대신하지 않는다.
