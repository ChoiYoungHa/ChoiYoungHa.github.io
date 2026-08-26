import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import mainPath from '../data/main-path.json' with { type: 'json' }
import { sampleCenterline, type PathPoint } from './scatter/exclusionMask'
import { sampleHeight } from './terrain/heightmap'

/**
 * M1-06 — 길 시각화. 중심선을 따라가는 폭 3m strip.
 *
 * 완료 조건은 "길 폭 3m ±0.2m, 끊김 0" 이다.
 *   - 폭: `main-path.json` 의 widthMeters(3) 를 그대로 쓴다. 상수를 여기 다시 적지 않는다.
 *   - 끊김 0: 중심선을 등간격으로 촘촘히 샘플해 **하나의 연속 triangle strip** 으로 만든다.
 *     구간마다 별도 메시를 만들면 이음매에 틈이 생긴다.
 *
 * 높이는 지형과 같은 `sampleHeight` 에 +0.05m. 길 반경 6m 는 heightmap 에서 이미
 * 평탄화돼 있으므로(M1-02·03 대체) strip 이 지형을 파고들거나 뜨지 않는다.
 */

const WIDTH = mainPath.widthMeters
/** 중심선 샘플 수. 136m 를 240 등분 ≈ 0.57m 간격이면 곡선이 각져 보이지 않는다. */
const SAMPLES = 240
/** z-fighting 방지용 들어올림(m). */
const LIFT = 0.05

function buildPathGeometry(): BufferGeometry {
  const centerline: PathPoint[] = mainPath.waypoints.map((w) => ({ x: w.x, z: w.z }))
  const points = sampleCenterline(centerline, SAMPLES)

  const positions = new Float32Array(points.length * 2 * 3)
  const half = WIDTH / 2

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    // 진행 방향 — 끝점은 이웃 한쪽만 쓴다
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    let tx = next.x - prev.x
    let tz = next.z - prev.z
    const len = Math.hypot(tx, tz) || 1
    tx /= len
    tz /= len
    // 좌우 법선(XZ 평면에서 90도 회전)
    const nx = -tz
    const nz = tx

    const lx = p.x + nx * half
    const lz = p.z + nz * half
    const rx = p.x - nx * half
    const rz = p.z - nz * half

    const o = i * 6
    positions[o + 0] = lx
    positions[o + 1] = sampleHeight(lx, lz) + LIFT
    positions[o + 2] = lz
    positions[o + 3] = rx
    positions[o + 4] = sampleHeight(rx, rz) + LIFT
    positions[o + 5] = rz
  }

  // 연속 strip 을 인덱스로 잇는다 — 이음매 없음
  const quads = points.length - 1
  const indices = new Uint32Array(quads * 6)
  for (let i = 0; i < quads; i++) {
    const a = i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    const o = i * 6
    indices[o + 0] = a
    indices[o + 1] = c
    indices[o + 2] = b
    indices[o + 3] = b
    indices[o + 4] = c
    indices[o + 5] = d
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export function MainPath() {
  const geometry = useMemo(buildPathGeometry, [])
  return (
    <mesh name="main-path" geometry={geometry} receiveShadow>
      {/* 지형(#4b4a33)보다 살짝 밝은 저채도 흙길. §6-1 채도 중앙값 22% 이하 유지 */}
      <meshStandardMaterial color="#6b6653" roughness={0.9} metalness={0} />
    </mesh>
  )
}
