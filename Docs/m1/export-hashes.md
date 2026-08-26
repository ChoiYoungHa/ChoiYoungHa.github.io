# M1-13·14 에셋 export 기록

실행일: 2026-08-26. 원본 6종을 `@gltf-transform/cli 4.4.2`의 `merge --merge-scenes` → `dedup` → `prune` 순서로 정리했다. 모델이 이미 매우 작고 런타임에 Meshopt decoder가 연결되지 않았으므로 `meshopt`는 적용하지 않았다.

| 묶음 | DCC export | runtime | bytes | SHA-256 | 원본 tris 합 | 텍스처 |
|---|---|---|---:|---|---:|---:|
| 식생 3종 | `DCC/exports/vegetation_kit.glb` | `public/models/vegetation_kit.glb` | 16,900 | `c7c5d5992a33e93456882d0a2a658aaae0f2e65637a45fdfd7800a9fc3567ff7` | 240 | 0 |
| 바위 3종 | `DCC/exports/props_rocks.glb` | `public/models/props_rocks.glb` | 12,844 | `40a1f3bc061f07dc604248a48c93883d3de749e31161902f8152ab5b9c63687a` | 172 | 0 |

각 행의 export와 runtime 복사본은 byte 수와 SHA-256이 일치한다. 두 파일 모두 glTF Transform `validate` 대상으로 사용한다.
