import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three'
import { bakeGlbVertexColor } from '../src/scene/util/bakeGlbVertexColor.ts'

function scene() {
  const g = new Group()
  const a = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: new Color(1, 0, 0) }))
  a.position.set(0, 0.5, 0)
  const b = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial({ color: new Color(0, 0, 1) }))
  b.position.set(0, 1.25, 0)
  g.add(a, b)
  return g
}

test('bakeGlbVertexColor: 재질 2개 → 지오메트리 1개·그룹 0·정점색 길이 = 정점 수', () => {
  const baked = bakeGlbVertexColor(scene(), { desaturate: 0 })
  const count = baked.geometry.attributes.position.count
  assert.equal(baked.geometry.groups.length, 0)
  assert.equal(baked.geometry.attributes.color.count, count)
  assert.equal(count, 48) // 박스 2개 × 24 정점
  assert.equal(baked.triangles, 24)
  // 첫 박스 정점은 빨강, 두 번째는 파랑
  const c = baked.geometry.attributes.color
  assert.deepEqual([c.getX(0), c.getY(0), c.getZ(0)], [1, 0, 0])
  assert.deepEqual([c.getX(47), c.getY(47), c.getZ(47)], [0, 0, 1])
})

test('bakeGlbVertexColor: pivot bottom 은 minY=0, top 은 maxY=0, 높이 1.5', () => {
  const bottom = bakeGlbVertexColor(scene(), { desaturate: 0 })
  bottom.geometry.computeBoundingBox()
  assert.ok(Math.abs(bottom.geometry.boundingBox.min.y) < 1e-6)
  assert.ok(Math.abs(bottom.height - 1.5) < 1e-6)
  const top = bakeGlbVertexColor(scene(), { pivot: 'top', desaturate: 0 })
  top.geometry.computeBoundingBox()
  assert.ok(Math.abs(top.geometry.boundingBox.max.y) < 1e-6)
})

test('bakeGlbVertexColor: desaturate 는 휘도 쪽으로 섞고, tint 는 곱한다', () => {
  const d = bakeGlbVertexColor(scene(), { desaturate: 1 })
  const c = d.geometry.attributes.color
  assert.ok(Math.abs(c.getX(0) - c.getY(0)) < 1e-6 && Math.abs(c.getY(0) - c.getZ(0)) < 1e-6)
  const t = bakeGlbVertexColor(scene(), { desaturate: 0, tint: new Color(0.5, 0.5, 0.5) })
  assert.ok(Math.abs(t.geometry.attributes.color.getX(0) - 0.5) < 1e-6)
})
