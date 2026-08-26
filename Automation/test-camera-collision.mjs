import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * R114-A (D6) 카메라 충돌 순수 함수 테스트. 실행: node --test Automation/test-camera-collision.mjs
 * GPU·three 없이 돈다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const cam = await load('src/player/cameraCollision.ts')
const vil = await load('src/scene/colliders/village.ts')

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps

test('막는 것이 없으면 요청 거리 그대로', () => {
  const r = cam.clampCameraDistance({ x: 0, z: 0 }, { x: 0, z: 6 }, [], [])
  assert.equal(r.blocked, false)
  assert.ok(near(r.distance, 6))
  assert.ok(near(r.fraction, 1))
})

test('축 정렬 박스가 선분 중간을 막으면 벽 앞(margin 포함)에서 멈춘다', () => {
  const box = { x: 0, z: 4, halfX: 2, halfZ: 1, rotationY: 0 } // z 3..5
  const r = cam.clampCameraDistance({ x: 0, z: 0 }, { x: 0, z: 6 }, [box], [], { margin: 0.35, minDistance: 1.5 })
  assert.equal(r.blocked, true)
  assert.ok(near(r.distance, 3 - 0.35), `distance ${r.distance}`)
})

test('회전 박스(45°)도 로컬 좌표로 판정한다', () => {
  const box = { x: 0, z: 4, halfX: 1, halfZ: 1, rotationY: Math.PI / 4 }
  const t = cam.segmentBoxEntry({ x: 0, z: 0 }, { x: 0, z: 6 }, box, 0)
  // 45° 회전한 정사각형(반폭 1)의 아래 꼭짓점은 z = 4 - sqrt(2)
  assert.ok(near(t * 6, 4 - Math.SQRT2, 1e-6), `t ${t}`)
})

test('플레이어가 박스 안이면 t=0 이고 거리는 minDistance 로 클램프', () => {
  const box = { x: 0, z: 0, halfX: 3, halfZ: 3, rotationY: 0 }
  const r = cam.clampCameraDistance({ x: 0, z: 0 }, { x: 0, z: 6 }, [box], [])
  assert.equal(r.blocked, true)
  assert.ok(near(r.distance, cam.CAMERA_MIN_DISTANCE))
})

test('요청 거리가 minDistance 보다 짧으면 더 늘리지 않는다', () => {
  const box = { x: 0, z: 0.5, halfX: 3, halfZ: 0.1, rotationY: 0 }
  const r = cam.clampCameraDistance({ x: 0, z: 0 }, { x: 0, z: 1 }, [box], [], { minDistance: 1.5, margin: 0 })
  assert.ok(r.distance <= 1 + 1e-9)
})

test('원(거대 수목 줄기)도 막는다', () => {
  const r = cam.clampCameraDistance({ x: 0, z: 0 }, { x: 0, z: 10 }, [], [{ x: 0, z: 8, radius: 2 }], { margin: 0 })
  assert.equal(r.blocked, true)
  assert.ok(near(r.distance, 6), `distance ${r.distance}`)
})

test('선분이 박스 옆을 스치기만 하면 막지 않는다', () => {
  const box = { x: 3, z: 3, halfX: 1, halfZ: 1, rotationY: 0 }
  const r = cam.clampCameraDistance({ x: 0, z: 0 }, { x: 0, z: 6 }, [box], [], { margin: 0.35 })
  assert.equal(r.blocked, false)
})

test('실제 마을 콜라이더: 마야 앞(house-b 3m)에서 집 반대편을 등지면 카메라가 집에 막힌다', () => {
  // placement npcs maya = (-5.45, 17.66), village-02(house-b) 쪽 3m 이동한 위치. 집 쪽으로 카메라를 보내면 막혀야 한다.
  const boxes = vil.VILLAGE_COLLIDERS
  const house = boxes.find((b) => b.buildingId === 'village-02')
  assert.ok(house, 'village-02 collider 존재')
  const player = { x: -5.45, z: 17.66 }
  const toward = { x: house.x, z: house.z }
  const len = Math.hypot(toward.x - player.x, toward.z - player.z)
  const desired = { x: player.x + (toward.x - player.x) / len * 6, z: player.z + (toward.z - player.z) / len * 6 }
  const r = cam.clampCameraDistance(player, desired, boxes, [])
  assert.equal(r.blocked, true)
  assert.ok(r.distance < 6 && r.distance >= cam.CAMERA_MIN_DISTANCE, `distance ${r.distance}`)
})
