import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRemotePlayer, hostPeerId, interpolatePose, isNetMessage, isStale, pushSample, roomIdFromSearch, sanitizeName } from '../src/net/protocol.ts'

const pose = (x, extra = {}) => ({ x, y: 0, z: 0, rotY: 0, speed: 1, grounded: true, attackSeq: 0, skillSeq: 0, ...extra })

test('roomIdFromSearch: 기본 lobby, 소문자·허용 문자만·24자 제한', () => {
  assert.equal(roomIdFromSearch(''), 'lobby')
  assert.equal(roomIdFromSearch('?room=My Room!'), 'myroom')
  assert.equal(roomIdFromSearch('?room=' + 'a'.repeat(40)).length, 24)
  assert.equal(roomIdFromSearch('?room=!!!'), 'lobby')
  assert.equal(hostPeerId('lobby'), 'w3d-mushroom-lobby-host')
})

test('sanitizeName: 공백·제어문자 제거, 12자, 비면 여행자', () => {
  assert.equal(sanitizeName('  영하  '), '영하')
  assert.equal(sanitizeName('<script>'), 'script')
  assert.equal(sanitizeName(''), '여행자')
  assert.equal(sanitizeName('abcdefghijklmnop').length, 12)
})

test('isNetMessage: 형태 검증', () => {
  assert.ok(isNetMessage({ t: 'state', id: 'a', pose: pose(1) }))
  assert.ok(!isNetMessage({ t: 'state', id: 'a', pose: { x: 'nope' } }))
  assert.ok(!isNetMessage({ t: 'state', id: 'a', pose: pose(Infinity) }))
  assert.ok(isNetMessage({ t: 'bye', id: 'a' }))
  assert.ok(!isNetMessage(null))
  assert.ok(!isNetMessage({ t: 'unknown' }))
})

test('interpolatePose: 지연 150ms 기준으로 두 샘플 사이 선형 보간, 외삽 없음', () => {
  const r = createRemotePlayer('p', { name: 'x', jobId: 'warrior', weapon: null }, 0)
  pushSample(r, pose(0), 1000)
  pushSample(r, pose(10), 1100)
  // render at 1200-150 = 1050 → 중간
  const mid = interpolatePose(r.samples, 1200)
  assert.ok(Math.abs(mid.x - 5) < 1e-9)
  // 미래 샘플 없음 → 마지막에 머문다
  const late = interpolatePose(r.samples, 5000)
  assert.equal(late.x, 10)
  // 샘플 이전 시각 → 첫 샘플
  const early = interpolatePose(r.samples, 1000)
  assert.equal(early.x, 0)
  assert.equal(interpolatePose([], 0), null)
})

test('interpolatePose: 각도는 최단 경로로 보간', () => {
  const samples = [{ atMs: 0, pose: pose(0, { rotY: Math.PI - 0.1 }) }, { atMs: 100, pose: pose(0, { rotY: -Math.PI + 0.1 }) }]
  const mid = interpolatePose(samples, 200)
  assert.ok(Math.abs(Math.abs(mid.rotY) - Math.PI) < 1e-6)
})

test('pushSample: 최근 3개 유지, isStale 6초', () => {
  const r = createRemotePlayer('p', { name: 'x', jobId: 'warrior', weapon: null }, 0)
  for (let i = 0; i < 6; i++) pushSample(r, pose(i), i * 100)
  assert.equal(r.samples.length, 3)
  assert.equal(r.samples[0].pose.x, 3)
  assert.ok(!isStale(r, 500 + 5999))
  assert.ok(isStale(r, 500 + 6001))
})
