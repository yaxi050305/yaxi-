import * as THREE from 'three'
import { bank, clamp, mix } from './river.js'
import { geometry, mesh, tube, vec } from './geometry.js'

const crossings = [
  [48, 1, 15.8], [109, -1, 13.9], [173, 1, 14.8],
  [248, -1, 15.2], [323, 1, 14.7], [373, -1, 13.8],
]

const hide = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 })
const scales = new THREE.MeshStandardMaterial({ color: 0x46543a, roughness: 0.89 })
const limb = new THREE.MeshStandardMaterial({ color: 0x495539, roughness: 0.93, side: THREE.DoubleSide })
const muzzle = new THREE.MeshStandardMaterial({ color: 0x242d20, roughness: 0.90, side: THREE.DoubleSide })
const eye = new THREE.MeshStandardMaterial({ color: 0xc89a47, emissive: 0x553411, emissiveIntensity: 0.23 })
const socket = new THREE.SphereGeometry(1, 9, 6)

function shapedBody(sections) {
  const positions = []
  const colors = []
  const indices = []
  const sides = 12
  const upperTint = new THREE.Color(0x677052)
  const lowerTint = new THREE.Color(0x817959)
  const color = new THREE.Color()
  for (const [row, [z, width, bottom, top]] of sections.entries()) {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2
      const height = (Math.sin(angle) + 1) / 2
      const facet = 0.91 + 0.11 * Math.sin(side * 5.13 + row * 3.75)
      positions.push(Math.cos(angle) * width * facet, mix(bottom, top, height ** 0.9), z)
      color.copy(upperTint).lerp(lowerTint, 0.56 * (1 - height)).multiplyScalar(facet)
      colors.push(color.r, color.g, color.b)
      if (row === sections.length - 1) continue
      const a = row * sides + side
      const b = row * sides + (side + 1) % sides
      indices.push(a, b, a + sides, b, b + sides, a + sides)
    }
  }
  return geometry(positions, colors, indices)
}

function crocodileModel() {
  const group = new THREE.Group()
  group.name = 'Swimming crocodile'
  const bodySections = [
    [-2.20, 0.025, 0.019, 0.106], [-2.15, 0.26, -0.030, 0.136], [-1.86, 0.29, -0.085, 0.148],
    [-1.55, 0.31, -0.11, 0.178], [-1.28, 0.39, -0.15, 0.323], [-0.96, 0.40, -0.18, 0.341],
    [-0.69, 0.32, -0.23, 0.277], [-0.34, 0.40, -0.36, 0.315], [0.12, 0.49, -0.39, 0.361],
    [0.54, 0.46, -0.35, 0.334], [0.93, 0.30, -0.29, 0.239], [1.15, 0.22, -0.27, 0.191],
  ]
  group.add(mesh(shapedBody(bodySections), hide))
  for (const sign of [-1, 1]) {
    const jaw = tube([vec(sign * 0.24, 0.068, -2.10), vec(sign * 0.292, 0.053, -1.77),
      vec(sign * 0.335, 0.046, -1.39), vec(sign * 0.358, 0.055, -1.16)], 0.015, 0.008, 8, 5)
    group.add(mesh(jaw, muzzle))
    const brow = mesh(socket, limb, sign * 0.278, 0.246, -1.17)
    brow.scale.set(0.136, 0.104, 0.188)
    group.add(brow)
    const iris = mesh(socket, eye, sign * 0.373, 0.281, -1.198)
    iris.scale.set(0.031, 0.046, 0.054)
    group.add(iris)
    const pupil = mesh(socket, muzzle, sign * 0.399, 0.284, -1.205)
    pupil.scale.set(0.009, 0.033, 0.016)
    group.add(pupil)
    const nostril = mesh(socket, muzzle, sign * 0.108, 0.134, -2.04)
    nostril.scale.set(0.051, 0.019, 0.037)
    group.add(nostril)

    for (const z of [-0.47, 0.63]) {
      group.add(mesh(tube([vec(sign * 0.23, -0.14, z), vec(sign * 0.65, -0.23, z + 0.13),
        vec(sign * 0.68, -0.20, z + 0.46)], 0.127, 0.049, 6, 6), limb))
    }
  }

  const plates = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), scales, 24)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 24; i++) {
    const row = Math.floor(i / 4)
    const side = i % 4 - 1.5
    const t = row / 5
    dummy.position.set(side * (0.15 - Math.abs(t - 0.45) * 0.075),
      0.34 - side * side * 0.035 - Math.abs(t - 0.46) * 0.16, -0.68 + row * 0.315)
    dummy.rotation.y = side * 0.12
    dummy.scale.set(0.090, 0.109 - Math.abs(side) * 0.014, 0.174)
    dummy.updateMatrix()
    plates.setMatrixAt(i, dummy.matrix)
  }
  group.add(plates)

  const tail = new THREE.Group()
  tail.position.z = 0.99
  tail.add(mesh(shapedBody([
    [0, 0.28, -0.29, 0.22], [0.32, 0.225, -0.24, 0.246],
    [0.71, 0.149, -0.18, 0.205], [1.02, 0.106, -0.12, 0.149],
  ]), hide))
  const tip = new THREE.Group()
  tip.position.z = 0.98
  tip.add(mesh(shapedBody([
    [0, 0.111, -0.12, 0.151], [0.36, 0.088, -0.094, 0.177],
    [0.78, 0.046, -0.089, 0.123], [1.27, 0.004, -0.034, 0.007],
  ]), hide))
  tail.add(tip)
  group.add(tail)
  return { group, tail, tip }
}

export class Crocodiles {
  constructor(scene) {
    this.crossings = crossings.map(([station, direction, duration]) => {
      const model = crocodileModel()
      scene.add(model.group)
      return { station, direction, duration, ...model }
    })
    this.reset()
  }

  reset() {
    for (const crossing of this.crossings) {
      crossing.group.visible = false
      crossing.elapsed = -1
      crossing.wakeTime = 0
    }
  }

  update(dt, boat, onWake) {
    let nearby = false
    let hit = false
    for (const crossing of this.crossings) {
      const { station, direction, duration, group, tail, tip } = crossing
      if (crossing.elapsed < 0 && boat.s >= station - 31 && boat.s <= station + 6) crossing.elapsed = 0
      if (crossing.elapsed < 0 || crossing.elapsed >= duration) continue
      crossing.elapsed = Math.min(duration, crossing.elapsed + dt)
      const t = crossing.elapsed / duration
      const s = station + (t - 0.5) * 6 + Math.sin(t * Math.PI) * direction * 2
      const x = mix(bank(s, -direction) + direction * 3.4, bank(s, direction) - direction * 3.4, t)
      const dx = crossing.elapsed > dt ? x - group.position.x : direction * 0.054
      const ds = crossing.elapsed > dt ? s + group.position.z : 0.010
      const yaw = Math.atan2(dx, ds)
      const depth = clamp(Math.min(t, 1 - t) * 18, 0, 1)
      const wag = crossing.elapsed * 4.8
      group.visible = t < 1
      group.position.set(x, mix(-0.48, 0.012, depth) + Math.sin(wag * 0.45) * 0.031, -s)
      group.rotation.y = -yaw + Math.sin(wag) * 0.028
      tail.rotation.y = Math.sin(wag) * 0.27
      tip.rotation.y = Math.sin(wag - 0.72) * 0.33
      if (depth > 0.6 && Math.abs(s - boat.s) <= 28) {
        nearby = true
        crossing.wakeTime -= dt
        const forwardX = Math.sin(yaw)
        const forwardS = Math.cos(yaw)
        if (crossing.wakeTime <= 0) {
          crossing.wakeTime = 0.40
          onWake(x - forwardX * 1.1, -s + forwardS * 1.1)
        }
        hit ||= boat.hitsCapsule(x + forwardX * 0.43, s + forwardS * 0.43, forwardX, forwardS, 2.75, 0.48)
          || boat.hitsCapsule(x - forwardX * 1.63, s - forwardS * 1.63, forwardX, forwardS, 1.62, 0.24)
      }
    }
    return { nearby, hit }
  }
}
