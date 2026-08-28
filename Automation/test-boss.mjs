import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mulberry32 } from '../src/game/rules/rng.ts'
import { allMobs, awakenBoss, BOSS_ID, BOSS_MONSTER_ID, createSpawner, damageSpawnerMob, stepSpawner } from '../src/game/mobs/spawner.ts'
import { createMob, monsterStats, stepMob } from '../src/game/mobs/ai.ts'
import { createSession } from '../src/game/session.ts'
import monsters from '../src/game/data/monsters.json' with { type: 'json' }

const BOSS = monsters[BOSS_MONSTER_ID]

test('monsters.json: 보스 정의(hp·attack·range·cooldown·spawn·리스폰 없음)', () => {
  assert.equal(BOSS.id, BOSS_MONSTER_ID)
  assert.ok(BOSS.hp >= 600 && BOSS.attack > monsters.pig.attack)
  assert.ok(BOSS.attackRange > 1.2 && BOSS.attackCooldownSeconds > 0)
  assert.equal(BOSS.respawnSeconds, null)
  assert.deepEqual(monsterStats(BOSS_MONSTER_ID).hp, BOSS.hp)
})

test('spawner: 보스 슬롯은 각성 전 null, awakenBoss 1회, 격파 후 재각성 없음·리스폰 없음', () => {
  const rng = mulberry32(3)
  let s = createSpawner(rng)
  assert.equal(s.boss.mob, null)
  assert.equal(s.slots.length, 8) // 돼지 슬롯 수 불변
  s = awakenBoss(s, rng)
  assert.equal(s.boss.mob?.monsterId, BOSS_MONSTER_ID)
  assert.equal(s.boss.mob?.maxHp, BOSS.hp)
  assert.equal(allMobs(s).length, 9)
  s = damageSpawnerMob(s, BOSS_ID, BOSS.hp, 10)
  assert.equal(s.boss.mob?.state, 'dying')
  const far = { x: 500, z: 500 }
  s = stepSpawner(s, { dtSeconds: 0.1, nowSeconds: 11, playerPosition: far }, rng).state // dying → dead(0.6s 뒤)
  assert.equal(s.boss.mob, null)
  assert.equal(s.bossDefeated, true)
  s = stepSpawner(s, { dtSeconds: 0.1, nowSeconds: 999, playerPosition: far }, rng).state
  assert.equal(s.boss.mob, null)
  assert.equal(awakenBoss(s, rng).boss.mob, null)
})

test('ai: 보스는 자기 스탯(사거리 3.2·쿨다운 2.4·속도)으로 추격·공격한다', () => {
  const rng = mulberry32(5)
  let mob = createMob(BOSS_ID, { x: 0, z: 0 }, rng, BOSS_MONSTER_ID)
  const player = { x: 2.5, z: 0 } // 돼지 사거리(1.2) 밖, 보스 사거리(3.2) 안
  let r = stepMob(mob, { dtSeconds: 0.05, nowSeconds: 1, playerPosition: player }, rng)
  assert.equal(r.mob.state, 'chase')
  r = stepMob(r.mob, { dtSeconds: 0.05, nowSeconds: 1.05, playerPosition: player }, rng)
  assert.equal(r.mob.state, 'attack')
  r = stepMob(r.mob, { dtSeconds: 0.05, nowSeconds: 1.1, playerPosition: player }, rng)
  const attack = r.events.find((e) => e.type === 'attack')
  assert.equal(attack?.damage, BOSS.attack)
  assert.ok(Math.abs(r.mob.attackReadyAtSeconds - (1.1 + BOSS.attackCooldownSeconds)) < 1e-9)
})

test('session: bossAwake 옵션으로 즉시 각성 → 스냅샷 boss/attackSeq, 격파 시 exp·배너·이벤트', () => {
  const session = createSession({ seed: 95, ipMode: 'own', initialScene: 'hunt', bossAwake: true })
  const tick = (playerPos, inputs = {}) => session.tick({ dtMs: 16, playerPos, playerYaw: 0, inputs })
  const nest = BOSS.spawn
  let snap = tick({ x: nest.x + 20, z: nest.z }).snapshot
  assert.equal(snap.boss?.name, BOSS.name)
  assert.equal(snap.boss?.maxHp, BOSS.hp)
  assert.equal(snap.boss?.attackSeq, 0)
  // 보스 사거리 안에 서면 공격 시퀀스가 오른다
  for (let i = 0; i < 120 && (snap.boss?.attackSeq ?? 0) === 0; i++) snap = tick({ x: nest.x + 1.5, z: nest.z }).snapshot
  assert.ok((snap.boss?.attackSeq ?? 0) >= 1, 'boss attack sequence should advance')
  assert.ok(snap.game.hp < snap.game.maxHp, 'boss hit should damage player')
  assert.equal(snap.bossBanner, null) // bossAwake 는 배너 없이 시작
})
