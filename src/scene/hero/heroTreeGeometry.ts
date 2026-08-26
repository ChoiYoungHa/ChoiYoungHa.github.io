import { mulberry32 } from '../scatter/seededRandom.ts'

/**
 * M2-02~06 — 거대 수목(hero tree) 절차적 지오메트리.
 *
 * Blender 미설치라 M2-02~05 의 blockout 을 **코드 생성으로 대체**한다(master 결정).
 * 로드맵의 tris·pivot·모듈 수 완료 조건은 그대로 실측한다.
 *
 * three·React 에 의존하지 않는다 — 순수 배열만 만든다.
 * 덕분에 브라우저 없이 Node 에서 삼각형 수·바운딩을 잰다(CLAUDE.md 코드 규칙).
 *
 * ## 왜 이 형태인가
 * 목표는 사진 재현이 아니라 **실루엣**이다(계획서 §1-1 L4). 그래서
 *   - 저폴리 + 면 법선(플랫 셰이딩). 부드러운 셰이딩은 실루엣에 기여하지 않는다.
 *   - **알파 없음.** 잎을 알파 텍스처로 만들지 않고 덩어리(ellipsoid)로 만든다.
 *     계획서 §3-2 렌더 순서 규약이 알파 블렌딩을 금지하고, alphaTest 도 오버드로를 만든다.
 *   - 정점 색으로 줄기/수관을 구분해 **재질 1개 = 드로우콜 1개**로 유지한다.
 */

/** 계획서 §6-2 팔레트. 줄기는 지붕 액센트(채도 41%)보다 낮은 채도여야 액센트를 잡아먹지 않는다. */
export const TRUNK_COLOR = { r: 0x5a / 255, g: 0x46 / 255, b: 0x32 / 255 } // #5A4632 HSL(30,29%,27%)
export const CANOPY_COLOR = { r: 0x3b / 255, g: 0x3e / 255, b: 0x26 / 255 } // #3B3E26 HSL(68,24%,20%)

/** M2-01 실루엣 브리프에서 고정한 치수(m). Docs/style-bible/hero-tree.md 와 같은 값이어야 한다. */
export const HERO_TREE = {
  height: 48,
  canopyDiameter: 34,
  trunkBaseDiameter: 5.2,
  trunkTopDiameter: 1.1,
  seed: 0x2026_0826,
} as const

export type Lod = 0 | 1

interface Vec3 {
  x: number
  y: number
  z: number
}

export interface HeroTreeModule {
  name: string
  kind: 'trunk' | 'branch' | 'canopy'
  /** 조립에 쓰인 개수 */
  count: number
  trianglesEach: number
  trianglesTotal: number
}

export interface HeroTreeBuild {
  lod: Lod
  /** 비인덱스 삼각형. 면 법선이라 플랫 셰이딩이 재질 플래그 없이 나온다. */
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  triangleCount: number
  modules: HeroTreeModule[]
  bounds: { minY: number; maxY: number; radiusXZ: number }
}

/** LOD 별 분할 수. LOD1 은 실루엣만 남기면 되므로 링·위도 분할을 줄인다. */
const LOD_PARAMS = {
  0: { trunkRadial: 12, trunkRings: 14, branchRadial: 7, branchRings: 7, canopyLat: 7, canopyLon: 12 },
  1: { trunkRadial: 6, trunkRings: 7, branchRadial: 4, branchRings: 4, canopyLat: 4, canopyLon: 7 },
} as const

// ── 기본 도형 ────────────────────────────────────────────────────────────────

interface Writer {
  pos: number[]
  nor: number[]
  col: number[]
  tris: number
}

function pushTriangle(w: Writer, a: Vec3, b: Vec3, c: Vec3, color: { r: number; g: number; b: number }) {
  const ux = b.x - a.x
  const uy = b.y - a.y
  const uz = b.z - a.z
  const vx = c.x - a.x
  const vy = c.y - a.y
  const vz = c.z - a.z
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz) || 1
  nx /= len
  ny /= len
  nz /= len
  for (const p of [a, b, c]) {
    w.pos.push(p.x, p.y, p.z)
    w.nor.push(nx, ny, nz)
    w.col.push(color.r, color.g, color.b)
  }
  w.tris += 1
}

/**
 * 중심선을 따라가는 테이퍼 튜브. 줄기와 가지를 같은 함수로 만든다.
 * 끝단 뚜껑은 덮지 않는다 — 줄기 밑동은 지형에 묻히고 가지 끝은 수관에 가린다.
 */
function tube(
  w: Writer,
  centerline: Vec3[],
  radii: number[],
  radial: number,
  color: { r: number; g: number; b: number },
): number {
  const before = w.tris
  const rings: Vec3[][] = []

  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i]
    const next = centerline[Math.min(centerline.length - 1, i + 1)]
    const prev = centerline[Math.max(0, i - 1)]
    let tx = next.x - prev.x
    let ty = next.y - prev.y
    let tz = next.z - prev.z
    const tl = Math.hypot(tx, ty, tz) || 1
    tx /= tl
    ty /= tl
    tz /= tl
    // 접선에 수직인 두 축
    const helper = Math.abs(ty) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    let ax = ty * helper.z - tz * helper.y
    let ay = tz * helper.x - tx * helper.z
    let az = tx * helper.y - ty * helper.x
    const al = Math.hypot(ax, ay, az) || 1
    ax /= al
    ay /= al
    az /= al
    const bx = ty * az - tz * ay
    const by = tz * ax - tx * az
    const bz = tx * ay - ty * ax

    const ring: Vec3[] = []
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2
      const ca = Math.cos(a) * radii[i]
      const sa = Math.sin(a) * radii[i]
      ring.push({ x: p.x + ax * ca + bx * sa, y: p.y + ay * ca + by * sa, z: p.z + az * ca + bz * sa })
    }
    rings.push(ring)
  }

  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial
      pushTriangle(w, rings[i][k], rings[i + 1][k], rings[i][k2], color)
      pushTriangle(w, rings[i][k2], rings[i + 1][k], rings[i + 1][k2], color)
    }
  }
  return w.tris - before
}

/** 저폴리 타원체. 수관 덩어리 하나. */
function ellipsoid(
  w: Writer,
  center: Vec3,
  rx: number,
  ry: number,
  rz: number,
  lat: number,
  lon: number,
  color: { r: number; g: number; b: number },
): number {
  const before = w.tris
  const grid: Vec3[][] = []
  for (let i = 0; i <= lat; i++) {
    const theta = (i / lat) * Math.PI
    const row: Vec3[] = []
    for (let j = 0; j < lon; j++) {
      const phi = (j / lon) * Math.PI * 2
      row.push({
        x: center.x + rx * Math.sin(theta) * Math.cos(phi),
        y: center.y + ry * Math.cos(theta),
        z: center.z + rz * Math.sin(theta) * Math.sin(phi),
      })
    }
    grid.push(row)
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const j2 = (j + 1) % lon
      const a = grid[i][j]
      const b = grid[i + 1][j]
      const c = grid[i][j2]
      const d = grid[i + 1][j2]
      if (i !== 0) pushTriangle(w, a, b, c, color)
      if (i !== lat - 1) pushTriangle(w, c, b, d, color)
    }
  }
  return w.tris - before
}

// ── 조립 ────────────────────────────────────────────────────────────────────

/** 가지 3종. 각도·길이를 숫자로 고정한다(로드맵 M2-03A/B/C 의 "모듈별 기록"). */
export const BRANCH_SPECS = [
  { name: 'branch_A', attachAtHeightRatio: 0.46, elevationDeg: 38, lengthRatio: 0.42, baseRadius: 1.05, count: 3 },
  { name: 'branch_B', attachAtHeightRatio: 0.62, elevationDeg: 26, lengthRatio: 0.34, baseRadius: 0.8, count: 3 },
  { name: 'branch_C', attachAtHeightRatio: 0.76, elevationDeg: 14, lengthRatio: 0.24, baseRadius: 0.55, count: 2 },
] as const

/** 수관 모듈 2종. A 는 큰 덩어리, B 는 실루엣을 깨는 작은 덩어리. */
export const CANOPY_SPECS = [
  { name: 'canopy_A', radiusRatio: 0.30, count: 4 },
  { name: 'canopy_B', radiusRatio: 0.19, count: 5 },
] as const

/** 줄기 중심선 — 약간 휘어 있다. 곧은 원기둥은 실루엣이 죽는다. */
function trunkCenterline(height: number, rings: number): { points: Vec3[]; radii: number[] } {
  const points: Vec3[] = []
  const radii: number[] = []
  const rBase = HERO_TREE.trunkBaseDiameter / 2
  const rTop = HERO_TREE.trunkTopDiameter / 2
  for (let i = 0; i <= rings; i++) {
    const t = i / rings
    const y = t * height * 0.82 // 줄기는 전체 높이의 82%까지, 위는 수관이 덮는다
    // 아래가 굵고 위로 갈수록 가늘어지는 지수 테이퍼 + 완만한 휨
    const lean = Math.pow(t, 1.4) * 2.6
    points.push({ x: lean, y, z: lean * 0.35 })
    radii.push(rTop + (rBase - rTop) * Math.pow(1 - t, 1.7))
  }
  return { points, radii }
}

export function buildHeroTree(lod: Lod = 0, seed: number = HERO_TREE.seed): HeroTreeBuild {
  const p = LOD_PARAMS[lod]
  const rng = mulberry32(seed)
  const w: Writer = { pos: [], nor: [], col: [], tris: 0 }
  const modules: HeroTreeModule[] = []
  const H = HERO_TREE.height
  const canopyR = HERO_TREE.canopyDiameter / 2

  // 1) 줄기
  const trunk = trunkCenterline(H, p.trunkRings)
  const trunkTris = tube(w, trunk.points, trunk.radii, p.trunkRadial, TRUNK_COLOR)
  modules.push({ name: 'trunk', kind: 'trunk', count: 1, trianglesEach: trunkTris, trianglesTotal: trunkTris })

  /** 줄기 중심선 위 임의 높이의 위치 */
  const trunkAt = (ratio: number): Vec3 => {
    const t = Math.min(1, Math.max(0, ratio / 0.82))
    const idx = t * (trunk.points.length - 1)
    const i0 = Math.floor(idx)
    const i1 = Math.min(trunk.points.length - 1, i0 + 1)
    const f = idx - i0
    const a = trunk.points[i0]
    const b = trunk.points[i1]
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }
  }

  // 2) 큰 가지 3종
  const branchTips: Vec3[] = []
  for (const spec of BRANCH_SPECS) {
    let each = 0
    for (let n = 0; n < spec.count; n++) {
      const base = trunkAt(spec.attachAtHeightRatio)
      const azimuth = (n / spec.count) * Math.PI * 2 + rng() * 0.6
      const elev = (spec.elevationDeg * Math.PI) / 180
      const len = H * spec.lengthRatio * (0.85 + rng() * 0.3)
      const rings = p.branchRings
      const pts: Vec3[] = []
      const rad: number[] = []
      for (let i = 0; i <= rings; i++) {
        const t = i / rings
        // 위로 휘는 가지 — 끝이 살짝 들린다
        const droop = Math.sin(t * Math.PI * 0.5) * len * 0.18
        pts.push({
          x: base.x + Math.cos(azimuth) * Math.cos(elev) * len * t,
          y: base.y + Math.sin(elev) * len * t + droop,
          z: base.z + Math.sin(azimuth) * Math.cos(elev) * len * t,
        })
        rad.push(spec.baseRadius * (1 - 0.75 * t))
      }
      each = tube(w, pts, rad, p.branchRadial, TRUNK_COLOR)
      branchTips.push(pts[pts.length - 1])
    }
    modules.push({
      name: spec.name,
      kind: 'branch',
      count: spec.count,
      trianglesEach: each,
      trianglesTotal: each * spec.count,
    })
  }

  // 3) 수관 — 가지 끝과 꼭대기에 덩어리를 얹어 하나의 실루엣을 만든다
  const crownCenter = { x: trunkAt(0.82).x, y: H * 0.80, z: trunkAt(0.82).z }
  for (const spec of CANOPY_SPECS) {
    let each = 0
    for (let n = 0; n < spec.count; n++) {
      const r = canopyR * spec.radiusRatio * (0.85 + rng() * 0.3)
      let c: Vec3
      if (spec.name === 'canopy_A') {
        // 큰 덩어리는 가지 끝 위에 얹는다
        const tip = branchTips[n % branchTips.length]
        c = { x: tip.x * 0.85, y: Math.max(tip.y, H * 0.62) + r * 0.35, z: tip.z * 0.85 }
      } else {
        // 작은 덩어리는 수관 위쪽을 채워 윤곽을 깬다
        const a = (n / spec.count) * Math.PI * 2 + rng()
        const rr = canopyR * (0.28 + rng() * 0.42)
        c = {
          x: crownCenter.x + Math.cos(a) * rr,
          y: crownCenter.y + (rng() - 0.25) * H * 0.14,
          z: crownCenter.z + Math.sin(a) * rr,
        }
      }
      each = ellipsoid(w, c, r * 1.15, r * 0.82, r * 1.15, p.canopyLat, p.canopyLon, CANOPY_COLOR)
    }
    modules.push({
      name: spec.name,
      kind: 'canopy',
      count: spec.count,
      trianglesEach: each,
      trianglesTotal: each * spec.count,
    })
  }

  // 피벗 정규화 — 밑동이 정확히 y=0 에 오게 내린다.
  // 줄기가 살짝 기울어 있어 밑동 링이 수평이 아니고, 그대로 두면 최저점이 지면 아래로 내려간다
  // (실측 -0.062m). 로드맵 M2-02 의 "1m 기준·피벗" 계약을 지키려면 여기서 맞춰야 한다.
  let rawMinY = Infinity
  for (let i = 1; i < w.pos.length; i += 3) if (w.pos[i] < rawMinY) rawMinY = w.pos[i]
  for (let i = 1; i < w.pos.length; i += 3) w.pos[i] -= rawMinY

  // 바운딩
  let minY = Infinity
  let maxY = -Infinity
  let radiusXZ = 0
  for (let i = 0; i < w.pos.length; i += 3) {
    const x = w.pos[i]
    const y = w.pos[i + 1]
    const z = w.pos[i + 2]
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    const r = Math.hypot(x, z)
    if (r > radiusXZ) radiusXZ = r
  }

  return {
    lod,
    positions: new Float32Array(w.pos),
    normals: new Float32Array(w.nor),
    colors: new Float32Array(w.col),
    triangleCount: w.tris,
    modules,
    bounds: { minY, maxY, radiusXZ },
  }
}
