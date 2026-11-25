import * as THREE from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { mesh, vec } from './geometry.js'

const skin = new THREE.MeshStandardMaterial({ roughness: 0.73, vertexColors: true })
const nail = new THREE.MeshStandardMaterial({ color: 0xd6a990, roughness: 0.58 })
const fabric = new THREE.MeshStandardMaterial({ color: 0x65706a, roughness: 0.97 })
const cuffFabric = new THREE.MeshStandardMaterial({ color: 0x768175, roughness: 0.96 })
const stitch = new THREE.MeshStandardMaterial({ color: 0x92917a, roughness: 1 })
const nailShape = new THREE.SphereGeometry(1, 14, 9)
const armGeometry = new THREE.CylinderGeometry(0.073, 0.104, 1, 20, 2)
const cuffGeometry = new THREE.CylinderGeometry(0.076, 0.083, 0.081, 20, 2)
const stitchGeometry = new THREE.CapsuleGeometry(0.0013, 0.006, 2, 5)
const up = vec(0, 1, 0)

const fingerPaths = [-0.074, -0.031, 0.017, 0.059].map((x, index) => {
  const length = [0.82, 1.0, 0.94, 0.77][index]
  return [
    [x, 0.069, 0.018, index === 0 ? 0.020 : 0.024],
    [x - 0.005, 0.075, -0.036, 0.023 * length ** 0.40],
    [x - 0.004, 0.034, -0.073 * length, 0.022 * length ** 0.46],
    [x + 0.002, -0.017, -0.059, 0.0185],
    [x + 0.009, -0.045 * length, -0.008, 0.015],
  ]
})
const thumbPath = [
  [0.051, 0.054, 0.089, 0.042],
  [0.089, 0.039, 0.065, 0.034],
  [0.105, 0.005, 0.028, 0.027],
  [0.117, -0.028, 0.004, 0.0225],
  [0.083, -0.046, -0.019, 0.020],
]
const skinTone = new THREE.Color(0xc29176)
let gripSurface

function makeSleeveTexture() {
  if (fabric.map) return
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  const pixels = context.createImageData(128, 128)
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const warp = Math.sin(x * Math.PI / 3)
      const weft = Math.sin(y * Math.PI / 3)
      const thread = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? warp : weft
      const noise = Math.sin(x * 17.51 + y * 47.13) * 4
      const value = 209 + thread * 7 + warp * weft * 3 + noise
      const index = (y * 128 + x) * 4
      pixels.data.set([value, value, value, 255], index)
    }
  }
  context.putImageData(pixels, 0, 0)
  const cloth = new THREE.CanvasTexture(canvas)
  cloth.colorSpace = THREE.SRGBColorSpace
  cloth.wrapS = cloth.wrapT = THREE.RepeatWrapping
  cloth.repeat.set(2, 5)
  cloth.anisotropy = 4
  const height = cloth.clone()
  height.colorSpace = THREE.NoColorSpace
  height.needsUpdate = true
  for (const material of [fabric, cuffFabric]) {
    material.map = cloth
    material.bumpMap = height
    material.bumpScale = 0.0018
  }
}

function ellipsoidDistance(x, y, z, rx, ry, rz) {
  const nx = x / rx, ny = y / ry, nz = z / rz
  const k0 = Math.sqrt(nx * nx + ny * ny + nz * nz)
  const k1 = Math.hypot(nx / rx, ny / ry, nz / rz)
  return k1 > 0.0001 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz)
}

function smoothJoin(a, b, radius) {
  const overlap = Math.max(0, radius - Math.abs(a - b)) / radius
  return Math.min(a, b) - overlap * overlap * radius * 0.25
}

function makeGripSurface() {
  const resolution = 53
  const volume = new MarchingCubes(resolution, skin, false, false, 32000)
  volume.isolation = 0
  const middle = vec(0.015, 0.035, 0.055)
  const extents = vec(0.175, 0.127, 0.191)
  const segments = [...fingerPaths, thumbPath].flatMap(path => path.slice(1).map((end, index) => {
    const start = path[index]
    const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2]
    return { start, dx, dy, dz, lengthInv: 1 / (dx * dx + dy * dy + dz * dz), endRadius: end[3] }
  }))
  const grid = (i, center, radius) => center + (i / (resolution * 0.5) - 1) * radius
  let point = 0
  for (let z = 0; z < resolution; z++) {
    const pz = grid(z, middle.z, extents.z)
    for (let y = 0; y < resolution; y++) {
      const py = grid(y, middle.y, extents.y)
      for (let x = 0; x < resolution; x++) {
        const px = grid(x, middle.x, extents.x)
        const palm = ellipsoidDistance(px, py - 0.070, pz - 0.020, 0.106, 0.049, 0.083)
        const wrist = ellipsoidDistance(px - 0.019, py - 0.047, pz - 0.133, 0.062, 0.047, 0.098)
        const heel = ellipsoidDistance(px - 0.048, py - 0.061, pz - 0.063, 0.063, 0.044, 0.069)
        let distance = smoothJoin(smoothJoin(palm, wrist, 0.030), heel, 0.017)
        for (const segment of segments) {
          const { start, dx, dy, dz, lengthInv, endRadius } = segment
          const ax = px - start[0], ay = py - start[1], az = pz - start[2]
          const along = Math.min(1, Math.max(0, (ax * dx + ay * dy + az * dz) * lengthInv))
          const offsetX = ax - along * dx, offsetY = ay - along * dy, offsetZ = az - along * dz
          const radius = THREE.MathUtils.lerp(start[3], endRadius, along)
          const separation = Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ) - radius
          distance = smoothJoin(distance, separation, pz > -0.023 ? 0.009 : 0.004)
        }
        volume.field[point++] = -distance
      }
    }
  }
  volume.update()

  const positions = volume.geometry.attributes.position.array.slice(0, volume.count * 3)
  const normals = volume.geometry.attributes.normal.array.slice(0, positions.length)
  const colors = new Float32Array(positions.length)
  const normal = vec(0, 0, 0)
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] = positions[i] * extents.x + middle.x
    const y = positions[i + 1] = positions[i + 1] * extents.y + middle.y
    const z = positions[i + 2] = positions[i + 2] * extents.z + middle.z
    normal.set(normals[i] / extents.x, normals[i + 1] / extents.y, normals[i + 2] / extents.z).normalize()
    normal.toArray(normals, i)
    const pressure = 1 - THREE.MathUtils.smoothstep(Math.hypot(y, z), 0.033, 0.087)
    const knuckle = (1 - THREE.MathUtils.smoothstep(z, -0.046, 0.026)) * THREE.MathUtils.smoothstep(y, 0.018, 0.10)
    const grain = Math.sin(x * 278 + z * 176) * Math.cos(y * 224 - z * 138) * 0.025
    const shade = 1 + grain - 0.17 * pressure
    colors[i] = skinTone.r * (shade + knuckle * 0.042)
    colors[i + 1] = skinTone.g * (shade - knuckle * 0.038)
    colors[i + 2] = skinTone.b * (shade - knuckle * 0.058)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const welded = mergeVertices(geometry, 0.00004)
  geometry.dispose()
  volume.geometry.dispose()
  return welded
}

export function addRowingHand(boat, pivot, side) {
  makeSleeveTexture()
  gripSurface ??= makeGripSurface()
  const grip = new THREE.Group()
  grip.name = side < 0 ? 'Left hand on the oar' : 'Right hand on the oar'
  grip.position.x = side * 0.32
  grip.scale.x = side
  pivot.add(grip)

  grip.add(mesh(gripSurface, skin))

  for (const finger of [...fingerPaths, thumbPath]) {
    const [x, y, z, radius] = finger.at(-1)
    const fingernail = mesh(nailShape, nail, x, y - radius * 0.88, z - radius * 0.19)
    fingernail.scale.set(radius * 0.57, 0.0028, radius * 0.67)
    fingernail.rotation.x = -0.24
    grip.add(fingernail)
  }

  const forearm = mesh(armGeometry, fabric)
  forearm.name = side < 0 ? 'Left sleeve' : 'Right sleeve'
  boat.add(forearm)
  const cuff = mesh(cuffGeometry, cuffFabric)
  const stitches = new THREE.InstancedMesh(stitchGeometry, stitch, 38)
  const stitchPose = new THREE.Object3D()
  for (let i = 0; i < stitches.count; i++) {
    const angle = i / stitches.count * Math.PI * 2
    stitchPose.position.set(Math.cos(angle) * 0.0805, -0.023, Math.sin(angle) * 0.0805)
    stitchPose.quaternion.setFromUnitVectors(up, vec(-Math.sin(angle), 0, Math.cos(angle)))
    stitchPose.updateMatrix()
    stitches.setMatrixAt(i, stitchPose.matrix)
  }
  cuff.add(stitches)
  boat.add(cuff)

  return {
    grip, forearm, cuff,
    wrist: vec(0.019, 0.044, 0.177),
    elbow: vec(side * 0.47, 1.01, 0.64),
    attachment: vec(0, 0, 0),
    axis: vec(0, 0, 0),
  }
}

export function poseRowingHand(hand, pivot) {
  hand.grip.updateMatrix()
  pivot.updateMatrix()
  hand.attachment.copy(hand.wrist).applyMatrix4(hand.grip.matrix).applyMatrix4(pivot.matrix)
  hand.axis.subVectors(hand.attachment, hand.elbow)
  const armLength = hand.axis.length()
  hand.axis.divideScalar(armLength)
  hand.forearm.position.lerpVectors(hand.elbow, hand.attachment, 0.5)
  hand.forearm.scale.y = armLength
  hand.forearm.quaternion.setFromUnitVectors(up, hand.axis)
  hand.cuff.position.copy(hand.attachment).addScaledVector(hand.axis, -0.018)
  hand.cuff.quaternion.copy(hand.forearm.quaternion)
}
