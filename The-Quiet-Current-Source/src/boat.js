import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { BOAT, RIVER } from './config.js'
import { bank, berth, center, clamp, heading, mix, obstacles } from './river.js'
import { combine, mesh, tube, vec, woodTexture } from './geometry.js'
import { addRowingHand, poseRowingHand } from './hands.js'

const hullProbes = [[-1.28, 0.56], [0, 0.85], [1.37, 0.62], [2.24, 0.34]]
const wrapping = angle => Math.atan2(Math.sin(angle), Math.cos(angle))

export class Boat {
  constructor(scene, onStroke, onCollision) {
    this.model = new THREE.Group()
    this.paddles = addBoatModel(this.model)
    this.model.traverse(part => {
      if (!part.isMesh) return
      part.castShadow = true
      part.receiveShadow = true
    })
    scene.add(this.model)
    this.onStroke = onStroke
    this.onCollision = onCollision
    this.reset()
  }

  reset() {
    this.x = center(RIVER.start) - 1.5
    this.s = RIVER.start
    this.vx = 0
    this.vs = 0
    this.speed = 0
    this.yaw = heading(this.s) * 0.74
    this.turn = 0
    this.roll = 0
    this.rollKick = 0
    this.pitchKick = 0
    this.hitCooldown = 0
    this.strokeClock = [BOAT.strokeInterval, BOAT.strokeInterval]
    this.lastStroke = -1
    this.strokeCount = 0
    this.lookX = 0
    this.lookY = 0
    this.viewYaw = 0
    this.viewPitch = 0
    this.docking = null
    this.moored = false
  }

  aim(dx, dy) {
    this.lookX = clamp(this.lookX + dx * BOAT.lookSensitivity, -BOAT.lookYaw, BOAT.lookYaw)
    this.lookY = clamp(this.lookY - dy * BOAT.lookSensitivity, -BOAT.lookPitch, BOAT.lookPitch)
  }

  update(dt, inputs) {
    this.hitCooldown = Math.max(0, this.hitCooldown - dt)
    for (const side of [0, 1]) {
      this.strokeClock[side] += dt
      if (!inputs[side] || this.strokeClock[side] < BOAT.strokeInterval) continue
      const sign = side === 0 ? -1 : 1
      const alternating = this.lastStroke !== side || inputs[1 - side]
      const thrust = BOAT.strokeImpulse * (alternating ? 1 : 0.86)
      this.vx += Math.sin(this.yaw) * thrust
      this.vs += Math.cos(this.yaw) * thrust
      this.turn -= sign * BOAT.turnImpulse * (alternating ? 0.83 : 1.18)
      this.rollKick += sign * 0.083
      this.pitchKick += 0.022
      this.strokeClock[side] = 0
      this.lastStroke = side
      this.strokeCount++
    }
    const entryTime = BOAT.strokeInterval * 0.32
    for (const side of [0, 1]) {
      if (this.strokeClock[side] >= entryTime && this.strokeClock[side] - dt < entryTime) {
        const blade = this.paddles[side].blade.getWorldPosition(vec(0, 0, 0))
        this.onStroke(blade.x, blade.z, side)
      }
    }

    const stream = heading(this.s) + Math.sin(this.s * 0.23) * 0.15
    const drag = 1 - Math.exp(-BOAT.waterDrag * dt)
    this.vx = mix(this.vx, Math.sin(stream) * BOAT.current, drag)
    this.vs = mix(this.vs, Math.cos(stream) * BOAT.current, drag)
    const velocity = Math.hypot(this.vx, this.vs)
    if (velocity > BOAT.maxSpeed) {
      this.vx *= BOAT.maxSpeed / velocity
      this.vs *= BOAT.maxSpeed / velocity
    }
    this.turn *= Math.exp(-BOAT.turnDrag * dt)
    this.yaw = wrapping(this.yaw + this.turn * dt)
    this.x += this.vx * dt
    this.s += this.vs * dt
    this.resolveCollisions()
    this.speed = Math.hypot(this.vx, this.vs)
    this.roll = mix(this.roll, this.rollKick, 1 - Math.exp(-6.5 * dt))
    this.rollKick *= Math.exp(-3 * dt)
    this.pitchKick *= Math.exp(-4 * dt)
    this.viewYaw = mix(this.viewYaw, this.lookX, 1 - Math.exp(-9 * dt))
    this.viewPitch = mix(this.viewPitch, this.lookY, 1 - Math.exp(-9 * dt))
  }

  resolveCollisions() {
    const forwardX = Math.sin(this.yaw)
    const forwardS = Math.cos(this.yaw)
    for (let pass = 0; pass < 3; pass++) {
      for (const [offset, radius] of hullProbes) {
        const x = this.x + forwardX * offset
        const s = this.s + forwardS * offset
        for (const side of [-1, 1]) {
          const depth = (x - bank(s, side)) * side + radius
          if (depth > 0) {
            const slope = (bank(s + 0.5, side) - bank(s - 0.5, side))
            const length = Math.hypot(1, slope)
            this.bump(-side / length, side * slope / length, depth / length, 'bank')
          }
        }
        for (const object of obstacles) {
          if (Math.abs(object.s - s) > 9 || Math.abs(object.x - x) > 9) continue
          const segment = clamp((x - object.x) * object.dx + (s - object.s) * object.ds,
            -object.length / 2, object.length / 2)
          const dx = x - object.x - object.dx * segment
          const ds = s - object.s - object.ds * segment
          const distance = Math.hypot(dx, ds)
          const depth = radius + object.radius - distance
          if (depth > 0) {
            const nx = distance > 0.001 ? dx / distance : -forwardX
            const ns = distance > 0.001 ? ds / distance : -forwardS
            this.bump(nx, ns, depth, object.kind)
          }
        }
      }
      if (this.s < -21) this.bump(0, 1, -21 - this.s, 'bank')
      if (this.s > RIVER.dock + 23) this.bump(0, -1, this.s - RIVER.dock - 23, 'bank')
    }
  }

  bump(nx, ns, depth, kind) {
    this.x += nx * (depth + 0.003)
    this.s += ns * (depth + 0.003)
    const impact = -(this.vx * nx + this.vs * ns)
    if (impact <= 0) return
    this.vx = (this.vx + nx * impact * 1.15) * 0.64
    this.vs = (this.vs + ns * impact * 1.15) * 0.64
    if (this.hitCooldown > 0 || impact < 0.32) return
    this.hitCooldown = 0.36
    this.rollKick += nx * Math.min(0.11, impact * 0.047)
    this.pitchKick -= Math.min(0.06, impact * 0.025)
    this.onCollision(kind, Math.min(1, impact / 2.4))
  }

  hitsCapsule(x, s, dx, ds, length, radius) {
    const forwardX = Math.sin(this.yaw)
    const forwardS = Math.cos(this.yaw)
    for (const [offset, hullRadius] of hullProbes) {
      const offsetX = this.x + forwardX * offset - x
      const offsetS = this.s + forwardS * offset - s
      const segment = clamp(offsetX * dx + offsetS * ds, -length / 2, length / 2)
      if (Math.hypot(offsetX - dx * segment, offsetS - ds * segment) < hullRadius + radius) return true
    }
    return false
  }

  beginDocking() {
    this.docking = {
      time: 0, x: this.x, s: this.s, yaw: this.yaw,
      speed: this.speed, vx: this.vx, vs: this.vs,
      viewYaw: this.viewYaw, viewPitch: this.viewPitch,
    }
  }

  updateDocking(dt) {
    const arrival = this.docking
    arrival.time += dt
    const t = clamp(arrival.time / BOAT.dockingSeconds, 0, 1)
    const ease = t * t * (3 - 2 * t)
    const glide = t * (1 - t) ** 3 * BOAT.dockingSeconds * 0.38
    this.x = mix(arrival.x, berth.x, ease) + arrival.vx * glide
    this.s = mix(arrival.s, berth.s, ease) + arrival.vs * glide
    this.yaw = arrival.yaw + wrapping(berth.yaw - arrival.yaw) * ease
    this.speed = (1 - ease) * arrival.speed
    this.roll *= Math.exp(-2 * dt)
    this.pitchKick *= Math.exp(-2 * dt)
    this.viewYaw = mix(arrival.viewYaw, 0.48, ease)
    this.viewPitch = mix(arrival.viewPitch, 0.034, ease)
    for (let side = 0; side < this.strokeClock.length; side++) this.strokeClock[side] += dt
    if (t < 1) return false
    this.vx = 0
    this.vs = 0
    this.turn = 0
    this.moored = true
    return true
  }

  stop() {
    this.vx = 0
    this.vs = 0
    this.speed = 0
    this.turn = 0
  }

  pose(time, camera) {
    const swell = this.moored ? 0.36 : 1
    const rise = (Math.sin(time * 1.52 + this.s * 0.095) * 0.032 + Math.sin(time * 2.37) * 0.017) * swell
    const lean = Math.sin(time * 1.16) * 0.014 + this.roll
    this.model.position.set(this.x, rise, -this.s)
    this.model.rotation.set(0, -this.yaw, 0, 'YXZ')
    this.model.rotation.x = this.pitchKick + Math.sin(time * 1.51) * 0.009
    this.model.rotation.z = lean
    for (const [side, paddle] of this.paddles.entries()) {
      const sign = side === 0 ? -1 : 1
      const phase = clamp(this.strokeClock[side] / BOAT.strokeInterval, 0, 1)
      const active = Math.sin(Math.PI * phase)
      paddle.pivot.position.set(sign * 0.58, 0.59 + Math.sin(phase * Math.PI * 2) * 0.044, -1.10 + active * 0.19)
      paddle.pivot.rotation.set(0.14 + active * 0.25, sign * (0.71 + active * (0.68 - phase * 1.88)),
        sign * (-0.08 - active * 0.43), 'YXZ')
      poseRowingHand(paddle.hand, paddle.pivot)
    }
    this.model.updateMatrixWorld(true)
    const seatOffset = 0.60 + clamp((0.87 - camera.aspect) * 1.78, 0, 0.77)
    camera.position.set(this.x - Math.sin(this.yaw) * seatOffset,
      1.69 + rise + this.pitchKick * 0.36, -this.s + Math.cos(this.yaw) * seatOffset)
    camera.rotation.set(-0.152 + this.viewPitch + this.pitchKick * 0.27,
      -this.yaw - this.viewYaw, lean * 0.44, 'YXZ')
  }
}

function hullSide(outline, profile, side) {
  const positions = []
  const uvs = []
  const colors = []
  const strips = [[], [], [], []]
  const length = 56
  const height = 20
  for (let row = 0; row <= length; row++) {
    const t = row / length
    const section = outline.getPoint(t)
    const keel = 0.005 + Math.abs(section.z) ** 3 * 0.015
    for (let column = 0; column <= height; column++) {
      const v = column / height
      const cross = profile.getPoint(v)
      positions.push(side * section.x * cross.x, mix(keel, section.y, cross.y), section.z)
      uvs.push(t, v)
      const seam = Math.min(column % 5, 5 - column % 5)
      const shade = 0.86 + 0.14 * Math.min(1, seam / 2)
      colors.push(shade, shade * 0.98, shade * 0.96)
      if (row === length || column === height) continue
      const a = row * (height + 1) + column
      const b = a + height + 1
      const strip = strips[Math.floor(column / 5)]
      if (side === 1) strip.push(a, a + 1, b, a + 1, b + 1, b)
      else strip.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const hull = new THREE.BufferGeometry()
  hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  hull.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  hull.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  hull.setIndex(strips.flat())
  let start = 0
  for (const [index, strip] of strips.entries()) {
    hull.addGroup(start, strip.length, [0, 1, 2, 1][index])
    start += strip.length
  }
  hull.computeVertexNormals()
  return hull
}

function bowDeck(outline) {
  const positions = []
  const uvs = []
  const indices = []
  const rows = 22
  const columns = 10
  for (let row = 0; row <= rows; row++) {
    const t = row / rows
    const section = outline.getPoint(t * 0.197)
    for (let column = 0; column <= columns; column++) {
      const width = column / columns * 2 - 1
      const crown = (1 - width * width) * Math.sin(t * Math.PI * 0.76) * 0.034
      positions.push(width * section.x * 0.91, section.y - 0.025 + crown, section.z)
      uvs.push(t, 0.5 + width * t * 0.5)
      if (row === rows || column === columns) continue
      const a = row * (columns + 1) + column
      const b = a + columns + 1
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const deck = new THREE.BufferGeometry()
  deck.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  deck.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  deck.setIndex(indices)
  deck.computeVertexNormals()
  return deck
}

function timberEdge(points, radius, endRadius, segments) {
  const sides = 14
  const rail = tube(points, radius, endRadius, segments, sides, 0.019)
  const uvs = []
  for (let ring = 0; ring <= segments; ring++) {
    for (let side = 0; side < sides; side++) {
      uvs.push(ring / segments, 0.19 + (0.5 + 0.5 * Math.sin(side * Math.PI * 2 / sides)) * 0.62)
    }
  }
  rail.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  return rail
}

function mooringLine() {
  const coil = []
  for (let i = 0; i <= 80; i++) {
    const t = i / 80
    const angle = t * Math.PI * 9.35 + 0.25
    const radius = mix(0.171, 0.056, t) + Math.sin(t * 18) * 0.008
    coil.push(vec(Math.cos(angle) * radius, 0.431 + t * 0.073,
      -1.78 + Math.sin(angle) * radius * 0.73))
  }
  coil.unshift(vec(-0.34, 0.413, -1.71), vec(-0.22, 0.420, -1.66))
  const path = new THREE.CatmullRomCurve3(coil)
  const sections = 218
  const frames = path.computeFrenetFrames(sections, false)
  const strands = [[], [], []]
  for (let ring = 0; ring <= sections; ring++) {
    const t = ring / sections
    const center = path.getPointAt(t)
    for (const [index, strand] of strands.entries()) {
      const turn = (t * 29 + index / strands.length) * Math.PI * 2
      strand.push(center.clone().addScaledVector(frames.normals[ring], Math.cos(turn) * 0.008)
        .addScaledVector(frames.binormals[ring], Math.sin(turn) * 0.008))
    }
  }
  return combine(strands.map(strand => tube(strand, 0.009, 0.008, sections, 6, 0.055)))
}

function paddleShaft() {
  const shaft = new THREE.CylinderGeometry(0.031, 0.042, 2.37, 18)
  const uv = shaft.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    const ring = uv.getX(i)
    uv.setXY(i, uv.getY(i), ring)
  }
  return shaft
}

function addBoatModel(group) {
  const texture = woodTexture()
  const grain = woodTexture(true)
  const wood = (color, roughness = 0.93) => new THREE.MeshStandardMaterial({
    color, map: texture, bumpMap: grain, bumpScale: 0.0041, roughnessMap: grain, roughness,
  })
  const planks = [wood(0x583d30, 0.57), wood(0x93765d), wood(0x87644c)]
  for (const plank of planks) {
    plank.side = THREE.DoubleSide
    plank.vertexColors = true
  }
  const rail = wood(0xbc9977, 0.87)
  rail.side = THREE.DoubleSide
  rail.vertexColors = true
  const decks = [wood(0xa38366), wood(0xb69571, 0.82), wood(0x94765c)]
  const metal = new THREE.MeshStandardMaterial({ color: 0x7d6850, roughness: 0.66, metalness: 0.68 })
  const crossSections = [
    [-2.76, 0.035, 0.87], [-2.54, 0.29, 0.71], [-2.12, 0.53, 0.58], [-1.62, 0.67, 0.49],
    [-1.0, 0.77, 0.45], [-0.25, 0.82, 0.44], [0.55, 0.80, 0.45], [1.19, 0.69, 0.50],
    [1.64, 0.49, 0.56], [1.93, 0.28, 0.64], [2.09, 0.035, 0.71],
  ]
  const outline = new THREE.CatmullRomCurve3(crossSections.map(([z, width, height]) => vec(width, height, z)))
  const profile = new THREE.CatmullRomCurve3([vec(0, 0, 0), vec(0.67, 0.22, 0), vec(0.90, 0.46, 0),
    vec(0.973, 0.73, 0), vec(1, 1, 0)], false, 'catmullrom')
  const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), metal, 16)
  const fastener = new THREE.Object3D()
  fastener.scale.set(0.020, 0.007, 0.020)
  for (const side of [-1, 1]) {
    const bounds = crossSections.map(([z, width, height]) => vec(side * width, height, z))
    group.add(mesh(timberEdge(bounds, 0.039, 0.042, 56), rail))
    group.add(mesh(hullSide(outline, profile, side), planks))
    for (let i = 0; i < 8; i++) {
      const section = outline.getPoint(0.21 + i * 0.097)
      fastener.position.set(side * section.x, section.y + 0.037, section.z)
      fastener.updateMatrix()
      rivets.setMatrixAt(i + (side === -1 ? 0 : 8), fastener.matrix)
    }
  }
  group.add(rivets)
  for (let i = 0; i < 16; i++) {
    const z = -2.42 + i * 0.27
    const width = 0.68 * Math.sqrt(Math.max(0.05, 1 - ((z + 0.25) / 2.5) ** 2))
    const board = mesh(new RoundedBoxGeometry(width * 2, 0.048, 0.255, 2, 0.017), decks[i % 3], 0, 0.105 + z * z * 0.018, z)
    group.add(board)
  }
  for (const [z, size] of [[-1.12, 1.40], [0.64, 1.45]]) {
    group.add(mesh(new RoundedBoxGeometry(size, 0.068, 0.24, 3, 0.017), decks[1], 0, 0.34, z))
  }
  for (const side of [-1, 1]) {
    group.add(mesh(new RoundedBoxGeometry(0.12, 0.045, 0.24, 2, 0.015), metal, side * 0.78, 0.47, -1.10))
  }
  group.add(mesh(bowDeck(outline), decks[1]))
  group.add(mesh(timberEdge([vec(0, 0.13, -2.54), vec(0, 0.48, -2.70),
    vec(0, 0.83, -2.77), vec(0, 0.879, -2.743)], 0.046, 0.044, 20), rail))
  const rope = new THREE.MeshStandardMaterial({ color: 0x9f9370, roughness: 1, vertexColors: true })
  group.add(mesh(mooringLine(), rope))

  return [-1, 1].map(sign => {
    const pivot = new THREE.Group()
    group.add(pivot)
    const shaft = mesh(paddleShaft(), decks[1], sign * 0.46, 0, 0)
    shaft.rotation.z = -Math.PI / 2
    pivot.add(shaft)
    const bladeOutline = new THREE.Shape()
    bladeOutline.moveTo(-0.25, -0.045)
    bladeOutline.quadraticCurveTo(-0.08, -0.10, 0.04, -0.12)
    bladeOutline.quadraticCurveTo(0.36, -0.185, 0.48, -0.117)
    bladeOutline.quadraticCurveTo(0.52, 0, 0.47, 0.12)
    bladeOutline.quadraticCurveTo(0.36, 0.175, 0.05, 0.115)
    bladeOutline.quadraticCurveTo(-0.10, 0.08, -0.25, 0.045)
    bladeOutline.closePath()
    const blade = mesh(new THREE.ExtrudeGeometry(bladeOutline, {
      depth: 0.035, bevelThickness: 0.017, bevelSize: 0.016, bevelSegments: 5, curveSegments: 12,
    }), decks[0], sign * 1.56, 0, 0)
    blade.rotation.x = (sign === -1 ? -0.74 : -0.86) * Math.PI
    if (sign === -1) blade.scale.x = -1
    pivot.add(blade)
    return { pivot, blade, hand: addRowingHand(group, pivot, sign) }
  })
}
