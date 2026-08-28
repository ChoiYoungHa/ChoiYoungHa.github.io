import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const QA_PATH = join(ROOT, 'Docs', 'qa', 'm3-shadow-config.json')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

const { shadowConfigForPreset } = await load('src/scene/shadows/shadowConfig.ts')
const { lodConfigForPreset } = await load('src/scene/foliage/lodConfig.ts')
const { textureConfigForPreset } = await load('src/gl/textureConfig.ts')

const expected = {
  low: {
    shadow: {
      cascades: 2,
      mapSize: 1024,
      maxDistance: 80,
      bias: -0.0002,
      normalBias: 0.02,
      lightCount: 1,
      strategy: 'single-shadow-frustum-fallback',
      fallback: { activeCascades: 1, mapSize: 1024, cameraNear: 0.1, cameraFar: 80, frustumHalfExtent: 30 },
    },
    lod: {
      coniferLodDistances: [25, 60, 90],
      rockLodDistances: [25, 60, 90],
      grassInstances: { count: 6000, radius: 25 },
      rockInstances: 300,
    },
    texture: { anisotropy: 4, textureTier: { default: '1K', hero: '2K' } },
  },
  base: {
    shadow: {
      cascades: 3,
      mapSize: 2048,
      maxDistance: 150,
      bias: -0.0002,
      normalBias: 0.02,
      lightCount: 1,
      strategy: 'single-shadow-frustum-fallback',
      fallback: { activeCascades: 1, mapSize: 2048, cameraNear: 0.1, cameraFar: 150, frustumHalfExtent: 45 },
    },
    lod: {
      coniferLodDistances: [35, 80, 140],
      rockLodDistances: [35, 80, 140],
      grassInstances: { count: 20000, radius: 40 },
      rockInstances: 600,
    },
    texture: { anisotropy: 8, textureTier: { default: '2K', hero: '2K' } },
  },
}

const values = {}

describe('preset consumer pure modules', () => {
  for (const preset of ['low', 'base']) {
    test(`${preset}: shadow §3-6·§4-1 values`, () => {
      const actual = shadowConfigForPreset(preset)
      assert.deepEqual(actual, expected[preset].shadow)
      values[preset] ??= {}
      values[preset].shadow = actual
    })

    test(`${preset}: conifer/rock LOD and instance values`, () => {
      const actual = lodConfigForPreset(preset)
      assert.deepEqual(actual, expected[preset].lod)
      values[preset] ??= {}
      values[preset].lod = actual
    })

    test(`${preset}: anisotropy and texture tier`, () => {
      const actual = textureConfigForPreset(preset)
      assert.deepEqual(actual, expected[preset].texture)
      values[preset] ??= {}
      values[preset].texture = actual
    })
  }
})

const threeRoot = join(ROOT, 'node_modules', 'three')
const legacyPath = join(threeRoot, 'examples', 'jsm', 'csm', 'CSM.js')
const nodePath = join(threeRoot, 'examples', 'jsm', 'csm', 'CSMShadowNode.js')
const legacySource = existsSync(legacyPath) ? readFileSync(legacyPath, 'utf8') : ''
const nodeSource = existsSync(nodePath) ? readFileSync(nodePath, 'utf8') : ''
const packageJson = JSON.parse(readFileSync(join(threeRoot, 'package.json'), 'utf8'))

const csmEvidence = {
  threeVersion: packageJson.version,
  legacy: {
    file: 'node_modules/three/examples/jsm/csm/CSM.js',
    exists: existsSync(legacyPath),
    bytes: existsSync(legacyPath) ? statSync(legacyPath).size : null,
    sha256: existsSync(legacyPath) ? createHash('sha256').update(readFileSync(legacyPath)).digest('hex') : null,
    importPath: 'three/addons/csm/CSM.js',
    importResolves: false,
    webGLRendererOnlyDoc: /only be used with \{@link WebGLRenderer\}/.test(legacySource),
    recommendsCSMShadowNode: /use \{@link CSMShadowNode\} instead/.test(legacySource),
    shaderChunkMutation: /ShaderChunk\.lights_fragment_begin\s*=/.test(legacySource),
    onBeforeCompileHook: /material\.onBeforeCompile\s*=/.test(legacySource),
    webGLFrustum: /CSMFrustum\( \{ webGL: true \} \)/.test(legacySource),
    compatibleWithWebGPURendererNodeMaterial: false,
  },
  nodeAlternative: {
    file: 'node_modules/three/examples/jsm/csm/CSMShadowNode.js',
    exists: existsSync(nodePath),
    bytes: existsSync(nodePath) ? statSync(nodePath).size : null,
    sha256: existsSync(nodePath) ? createHash('sha256').update(readFileSync(nodePath)).digest('hex') : null,
    importPath: 'three/addons/csm/CSMShadowNode.js',
    importResolves: false,
    webGPURendererOnlyDoc: /only be used with \{@link WebGPURenderer\}/.test(nodeSource),
    importsThreeWebgpu: /from 'three\/webgpu'/.test(nodeSource),
    importsTsl: /from 'three\/tsl'/.test(nodeSource),
  },
}

test('three r185 CSM compatibility evidence', async () => {
  assert.equal(csmEvidence.threeVersion, '0.185.1')
  assert.equal(csmEvidence.legacy.exists, true)
  assert.equal(csmEvidence.nodeAlternative.exists, true)
  const [legacyModule, nodeModule] = await Promise.all([
    import('three/addons/csm/CSM.js'),
    import('three/addons/csm/CSMShadowNode.js'),
  ])
  csmEvidence.legacy.importResolves = typeof legacyModule.CSM === 'function'
  csmEvidence.nodeAlternative.importResolves = typeof nodeModule.CSMShadowNode === 'function'
  assert.equal(csmEvidence.legacy.importResolves, true)
  assert.equal(csmEvidence.nodeAlternative.importResolves, true)
})

after(() => {
  const lookdev = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'lookdev.json'), 'utf8'))
  const qa = {
    schemaVersion: 1,
    testedHead: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    csmEvidence,
    decision: {
      adopted: 'single-shadow-frustum-fallback',
      reason: 'CSM.js is explicitly WebGLRenderer-only and patches ShaderChunk/onBeforeCompile; keep one shadow-casting directional light and vary mapSize/camera frustum by preset.',
      availableFutureOption: 'CSMShadowNode.js is present and WebGPURenderer/TSL-native, but requires coordinated Lighting/material integration after merge.',
      biasBasis: 'bias=0 and normalBias=0 preserve three r185 LightShadow defaults until GPU visual tuning.',
      sun: { elevationDeg: lookdev.sun.elevationDeg, azimuthDeg: lookdev.sun.azimuthDeg },
    },
    values,
    hookup: {
      'src/scene/Lighting.tsx': [
        "import { shadowConfigForPreset } from './shadows/shadowConfig'",
        'const shadow = shadowConfigForPreset(preset)',
        'light.shadow.mapSize.set(shadow.fallback.mapSize, shadow.fallback.mapSize)',
        'Object.assign(light.shadow.camera, { near: shadow.fallback.cameraNear, far: shadow.fallback.cameraFar })',
        'set ortho sides to ±shadow.fallback.frustumHalfExtent, then updateProjectionMatrix()',
      ],
      'src/scene/Foliage.tsx': [
        "import { lodConfigForPreset } from './foliage/lodConfig'",
        'const lod = lodConfigForPreset(preset)',
        'use lod.grassInstances.count/radius for scatter and visibility',
        'use lod.coniferLodDistances for the future conifer LOD selector',
      ],
      'src/scene/RockInstances.tsx': [
        "import { lodConfigForPreset } from './foliage/lodConfig'",
        'const lod = lodConfigForPreset(preset)',
        'use lod.rockInstances for scatter count',
        'use lod.rockLodDistances for LOD/cull thresholds',
      ],
      'src/gl/createRenderer.ts': [
        "import { Texture, WebGPURenderer } from 'three/webgpu'",
        "import { textureConfigForPreset } from './textureConfig'",
        "const preset = new URLSearchParams(location.search).get('q') === 'base' ? 'base' : 'low'",
        'const texture = textureConfigForPreset(preset)',
        'after renderer.init(): Texture.DEFAULT_ANISOTROPY = Math.min(texture.anisotropy, renderer.getMaxAnisotropy())',
      ],
    },
    limitations: [
      'The preparation modules are intentionally not imported by runtime code in this worktree.',
      'Texture tier still needs asset URL/loader selection; createRenderer hookup only seeds anisotropy for textures created afterward.',
      'Preview/GPU validation is pending master integration.',
    ],
  }
  mkdirSync(dirname(QA_PATH), { recursive: true })
  writeFileSync(QA_PATH, `${JSON.stringify(qa, null, 2)}\n`, 'utf8')
})
