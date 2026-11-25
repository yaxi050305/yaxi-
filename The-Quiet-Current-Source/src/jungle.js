import * as THREE from 'three'
import { RIVER, VISUALS } from './config.js'
import { bank, groundHeight, mix, seededRandom } from './river.js'
import { combine, geometry, mesh, stone, tube, vec } from './geometry.js'

const barkMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, color: 0x7b654a, roughness: 0.97, side: THREE.DoubleSide,
})
const foliageMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.87, side: THREE.DoubleSide,
})
const stoneMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 })

function leaf(positions, colors, indices, start, tip, sideways, width, color, simple = false) {
  const base = positions.length / 3
  if (simple) {
    const middle = start.clone().lerp(tip, 0.52)
    const ridge = middle.clone()
    ridge.y += width * 0.23
    const left = middle.clone().addScaledVector(sideways, width)
    const right = middle.clone().addScaledVector(sideways, -width)
    for (const [index, point] of [start, left, ridge, right, tip].entries()) {
      const shade = [0.73, 0.84, 1.21, 0.79, 1.03][index]
      positions.push(point.x, point.y, point.z)
      colors.push(color.r * shade, color.g * shade, color.b * shade)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3,
      base + 1, base + 4, base + 2, base + 2, base + 4, base + 3)
    return
  }
  const direction = tip.clone().sub(start)
  for (let k = 0; k <= 4; k++) {
    const t = k / 4
    const spread = Math.sin(Math.PI * t) ** 0.77 * width
    const middle = start.clone().addScaledVector(direction, t)
    middle.y += spread * 0.22
    for (let edge = -1; edge <= 1; edge++) {
      const vertex = middle.clone().addScaledVector(sideways, spread * edge)
      vertex.y -= Math.abs(edge) * spread * 0.30
      positions.push(vertex.x, vertex.y, vertex.z)
      const shade = (edge === 0 ? 1.18 : 0.79 + edge * 0.07) * mix(0.74, 1.15, t)
      colors.push(color.r * shade, color.g * shade, color.b * shade)
    }
    if (k === 4) continue
    const a = base + k * 3
    indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4,
      a + 1, a + 4, a + 2, a + 2, a + 4, a + 5)
  }
}

function palm(seed) {
  const random = seededRandom(seed)
  const height = 8.4
  const crown = vec(1.5, height, 0)
  const trunk = tube([vec(0, 0, 0), vec(0.16, 2.0, 0.1), vec(0.56, 5.5, 0.05), crown],
    0.27, 0.16, 27, 8)
  const fronds = []
  const positions = []
  const colors = []
  const indices = []
  const shade = new THREE.Color()
  for (let frond = 0; frond < 12; frond++) {
    const angle = frond * 2.39996 + random() * 0.28
    const direction = vec(Math.cos(angle), 0, Math.sin(angle))
    const side = vec(-direction.z, 0, direction.x)
    const length = mix(4.2, 6.7, random()) * (frond > 8 ? 0.74 : 1)
    const rise = frond < 8 ? 0.2 : 2.6
    const droop = mix(0.5, 1.7, random())
    const spine = t => crown.clone().addScaledVector(direction, length * t)
      .add(vec(0, Math.sin(t * 2.75) * (0.88 + rise) - droop * t * t + rise * t * 0.64, 0))
    fronds.push(tube([spine(0), spine(0.36), spine(0.68), spine(1)], 0.057, 0.01, 8, 4))
    for (let pair = 1; pair < 12; pair++) {
      const t = pair / 12
      const width = Math.sin(t * Math.PI) ** 0.72 * length * 0.22
      for (const sign of [-1, 1]) {
        const base = spine(t)
        const end = base.clone().addScaledVector(side, sign * width * mix(0.81, 1.13, random()))
          .addScaledVector(direction, length * 0.145)
        end.y -= width * mix(0.15, 0.56, random())
        shade.setHSL(mix(0.235, 0.29, random()), mix(0.53, 0.73, random()), mix(0.16, 0.32, random()))
        leaf(positions, colors, indices, base, end, direction, width * 0.20 + 0.035, shade)
      }
    }
  }
  return { wood: combine([trunk, ...fronds]), leaves: geometry(positions, colors, indices) }
}

function canopy(seed) {
  const random = seededRandom(seed)
  const branches = []
  const positions = []
  const colors = []
  const indices = []
  const clusters = []
  const height = mix(10.5, 13.5, random())
  const lean = mix(-0.9, 1.7, random())
  branches.push(tube([vec(0, -0.4, 0), vec(0.16, 3.4, -0.13), vec(lean * 0.6, height * 0.67, 0.35),
    vec(lean, height, -0.2)], 0.49, 0.13, 10, 8))
  for (let branch = 0; branch < 8; branch++) {
    const angle = branch * 2.39996 + random() * 0.45
    const radius = mix(2.4, 5.0, random())
    const direction = vec(Math.cos(angle), 0, Math.sin(angle))
    const end = direction.clone().multiplyScalar(radius).add(vec(lean, height * mix(0.74, 1.04, random()), 0))
    const root = vec(lean * 0.6, end.y - mix(2.3, 4.4, random()), 0)
    branches.push(tube([root, root.clone().lerp(end, 0.53).add(vec(0, -0.28, 0)), end], 0.19, 0.022, 6, 5))
    clusters.push({ point: end, size: mix(1.75, 2.65, random()) })
    clusters.push({ point: end.clone().addScaledVector(direction, -1.3).add(vec(0, 0.9, 0)), size: 1.8 })
  }
  clusters.push({ point: vec(lean, height + 0.68, 0), size: 2.8 })
  for (let root = 0; root < 6; root++) {
    const angle = root * 1.047 + random()
    const direction = vec(Math.cos(angle), 0, Math.sin(angle))
    const end = direction.clone().multiplyScalar(mix(1.5, 3.25, random()))
    end.y = -0.48
    branches.push(tube([direction.clone().multiplyScalar(0.25).add(vec(0, 1.22, 0)),
      end.clone().multiplyScalar(0.43).add(vec(0, 0.38, 0)), end], 0.28, 0.025, 5, 5))
  }
  const tint = new THREE.Color()
  for (const { point, size } of clusters) {
    for (let twig = 0; twig < 20; twig++) {
      const angle = twig * 2.39996 + random() * 0.78
      const radial = Math.sqrt(random()) * size
      const direction = vec(Math.cos(angle), 0, Math.sin(angle))
      const branch = point.clone().addScaledVector(direction, radial)
      branch.y += mix(-0.78, 0.8, random()) * size * 0.57
      const length = mix(0.48, 1.31, random()) * size / 2
      tint.setHSL(mix(0.215, 0.343, random()), mix(0.35, 0.63, random()), mix(0.13, 0.29, random()))
      const side = vec(-direction.z, 0, direction.x)
      const first = branch.clone().addScaledVector(direction, length).add(vec(0, mix(-0.32, 0.24, random()), 0))
      leaf(positions, colors, indices, branch, first, side, length * 0.51, tint, true)
      const second = branch.clone().addScaledVector(side, length * 0.74).add(vec(0, 0.26, 0))
      leaf(positions, colors, indices, branch, second, direction, length * 0.43, tint, true)
    }
  }
  return { wood: combine(branches), leaves: geometry(positions, colors, indices) }
}

function undergrowth(seed) {
  const random = seededRandom(seed)
  const positions = []
  const colors = []
  const indices = []
  const tint = new THREE.Color()
  for (let i = 0; i < 19; i++) {
    const angle = i * 2.39996 + random() * 0.6
    const length = mix(0.56, 2.13, random())
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    const start = vec(dx * 0.18, i < 9 ? 0.15 : 0.55, dz * 0.18)
    const tip = vec(dx * length, mix(0.23, 1.40, random()), dz * length)
    tint.setHSL(mix(0.20, 0.34, random()), mix(0.40, 0.62, random()), mix(0.16, 0.33, random()))
    leaf(positions, colors, indices, start, tip, vec(-dz, 0.28, dx), length * 0.20, tint)
  }
  return geometry(positions, colors, indices)
}

function makeBank(side) {
  const positions = []
  const colors = []
  const indices = []
  const bands = [-4, -1.6, -0.4, 0.5, 1.5, 2.6, 4.2, 6.5, 9.3, 13.4, 19, 26, 36, 51, 68]
  const sStart = -65
  const step = 1.45
  const rows = Math.ceil((RIVER.sceneryEnd - sStart) / step)
  const mud = new THREE.Color(0x4e4a2b)
  const sand = new THREE.Color(0x8b7950)
  const ground = new THREE.Color(0x374322)
  for (let row = 0; row <= rows; row++) {
    const s = sStart + row * step
    for (let col = 0; col < bands.length; col++) {
      const distance = bands[col]
      const x = bank(s, side) + side * distance
      positions.push(x, groundHeight(s, distance, side), -s)
      const coarse = 0.5 + 0.5 * Math.sin(s * 0.63 + distance * 2.5) * Math.cos(distance * 3.1 - s * 0.91)
      const color = distance > 2.6 ? ground.clone().lerp(mud, coarse * 0.65)
        : mud.clone().lerp(sand, coarse * 0.72)
      colors.push(color.r, color.g, color.b)
      if (row === rows || col === bands.length - 1) continue
      const a = row * bands.length + col
      const b = a + bands.length
      if (side === 1) indices.push(a, a + 1, b, b, a + 1, b + 1)
      else indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.99 })
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 terrainPoint;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nterrainPoint = position;')
    shader.fragmentShader = 'varying vec3 terrainPoint;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 grit = terrainPoint.xz;
      float grain = sin(grit.x * 31.0 + sin(grit.y * 17.0)) * cos(grit.y * 28.0);
      float patches = sin(grit.x * 2.1 + sin(grit.y * 2.8) * 1.8) * cos(grit.y * 1.2);
      diffuseColor.rgb *= 0.93 + grain * 0.11 + patches * 0.13;
    `)
  }
  return mesh(geometry(positions, colors, indices), material)
}

export function addJungle(scene) {
  scene.add(makeBank(-1), makeBank(1))
  const random = seededRandom(RIVER.seed)
  const palms = [palm(13), palm(27), palm(52)]
  const trees = [canopy(9), canopy(108), canopy(27)]
  const shrubs = [undergrowth(17), undergrowth(85)]
  const rocks = [stone(22), stone(79), stone(145)]
  const batches = new Map()
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()
  const batch = (landmark, material, s, adjustment) => {
    const key = landmark.id + '/' + Math.floor(s / 42)
    if (!batches.has(key)) batches.set(key, { landmark, material, matrices: [], colors: [] })
    const entry = batches.get(key)
    dummy.updateMatrix()
    entry.matrices.push(dummy.matrix.clone())
    entry.colors.push(tint.setRGB(adjustment * 0.99, adjustment, adjustment * 0.94).clone())
  }
  const plant = (list, kind, s, side, distance, scale, yaw = random() * 6.283) => {
    const prototype = list[Math.floor(random() * list.length)]
    const brightness = mix(0.69, 1.16, random())
    dummy.position.set(bank(s, side) + distance * side, groundHeight(s, distance, side) - 0.08, -s)
    dummy.rotation.set(mix(-0.12, 0.12, random()), yaw, mix(-0.10, 0.10, random()))
    dummy.scale.set(scale, scale * mix(0.88, 1.17, random()), scale)
    if (kind === 'tree') {
      batch(prototype.wood, barkMaterial, s, brightness)
      batch(prototype.leaves, foliageMaterial, s, brightness)
    } else {
      if (kind === 'rock') dummy.scale.set(scale * 1.16, scale * 0.73, scale)
      batch(prototype, kind === 'rock' ? stoneMaterial : foliageMaterial, s, brightness)
    }
  }
  for (const side of [-1, 1]) {
    for (let s = -38; s < RIVER.sceneryEnd; s += 2.8 / VISUALS.foliageDensity) {
      const location = s + random() * 3.7
      plant(shrubs, 'shrub', location, side, mix(0.5, 5.9, random()), mix(0.64, 1.9, random()))
      if (random() > 0.27) plant(rocks, 'rock', location, side, mix(-1.1, 2.4, random()), mix(0.34, 1.55, random()))
      if (random() > 0.38) plant(shrubs, 'shrub', location, side, mix(6.1, 16, random()), mix(0.9, 2.2, random()))
    }
    for (let s = -38; s < RIVER.sceneryEnd; s += 4.9 / VISUALS.foliageDensity) {
      const location = s + random() * 6
      const row = random()
      plant(row < 0.53 ? palms : trees, 'tree', location, side, mix(2.5, 9, random()), mix(0.65, 1.22, random()))
      plant(trees, 'tree', location + 3, side, mix(12, 24, random()), mix(0.96, 1.50, random()))
      if (random() > 0.31) plant(trees, 'tree', location - 2, side, mix(25, 46, random()), mix(1.15, 1.68, random()))
    }
    for (let s = 17; s < RIVER.sceneryEnd; s += 34) {
      const x = bank(s, side) + side * 1.2
      const parts = []
      for (let i = 0; i < 5; i++) {
        const top = vec(x + side * (0.6 + i * 0.44), 6.5 + random() * 5.3, -s + i * 0.68)
        parts.push(tube([top, top.clone().add(vec(-side * 0.55, -2.6, 0.3)),
          top.clone().add(vec(-side * (0.5 + random() * 0.7), -5.6, 0.6))], 0.045, 0.018, 8, 4))
      }
      scene.add(mesh(combine(parts), barkMaterial))
    }
  }
  const vista = [
    [1, -1, 0.8, 1.64, 0.16], [12, -1, 1.1, 1.46, 5.86],
    [21, -1, 0.8, 1.18, 0.22], [8, 1, 1.4, 1.72, 2.75],
    [19, 1, 2.0, 1.52, 3.0], [29, 1, 0.8, 1.94, 3.03],
    [38, 1, 1.1, 1.56, 2.79], [52, 1, 0.90, 1.58, 3.12], [47, -1, 1.12, 1.66, 0.21],
  ]
  for (const [s, side, distance, size, yaw] of vista) plant(palms, 'tree', s, side, distance, size, yaw)
  plant(trees, 'tree', 7, -1, 3.1, 1.72, 0.0)
  plant(trees, 'tree', 18, 1, 4.9, 1.59, 2.8)

  for (const { landmark, material, matrices, colors } of batches.values()) {
    const instances = new THREE.InstancedMesh(landmark, material, matrices.length)
    for (let i = 0; i < matrices.length; i++) {
      instances.setMatrixAt(i, matrices[i])
      instances.setColorAt(i, colors[i])
    }
    instances.instanceMatrix.needsUpdate = true
    instances.instanceColor.needsUpdate = true
    instances.computeBoundingSphere()
    scene.add(instances)
  }
}
