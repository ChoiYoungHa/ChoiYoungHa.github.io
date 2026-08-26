# 룩 변형 검증 결과 (lookdev-variants.mjs) 2026-08-26T13:44:23.970Z

기준: baseline 자동 PASS 합계(3장 × L1·L2·L3·L5). 변형은 합계를 줄이지 않고 목표를 전부 만족하면 ADOPT 후보.

| 변형 | 판정 | 자동 PASS | S3 원경 휘도 | L4 줄기/수관 Δ | L4 최소 Δ | S1 수목 bbox top | low worst tris | 사유 |
|---|---|---|---|---|---|---|---|---|
| baseline (기준) | **기준** | 8 | 166.4 | 4.6 | 4.6 | - | - | - |
| hazeDir | **REJECT** | 7 | 155.1 | - | - | - | - | 자동 PASS 합계 7 < baseline 8; s3.far.luma 155.1 !<= 145 |
| heroContrast | **REJECT** | 8 | 166.4 | 1.8 | 1.8 | - | - | l4.trunkCanopyDelta 1.8 !>= 10; l4.minDelta 1.8 !>= 10 |
| vistaPitch | **REJECT** | 5 | 166.4 | - | - | 0 | - | 자동 PASS 합계 5 < baseline 8; s1.treeBboxTop 0 !> 0 |
| grassLite | **ADOPT 후보** | 8 | 166.4 | - | - | - | 312434 | - |
| combo | **REJECT** | 7 | 155.1 | 1.8 | 1.8 | - | 312434 | 자동 PASS 합계 7 < baseline 8; s3.far.luma 155.1 !<= 145; l4.trunkCanopyDelta 1.8 !>= 10; l4.minDelta 1.8 !>= 10 |
