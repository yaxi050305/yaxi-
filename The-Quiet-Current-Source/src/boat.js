import * as THREE from 'three'
import { BOAT, RIVER } from './config.js'
import { bank, berth, center, clamp, heading, mix, obstacles } from './river.js'
import { mesh, tube, vec, woodTexture } from './geometry.js'
import { addRowingHand, poseRowingHand } from './hands.js'

const hullProbes = [[-1.28, 0.56], [0, 0.85], [1.37, 0.62], [2.24, 0.34]]
const wrapping = angle => Math.atan2(Math.sin(angle), Math.cos(angle))

export class Boat {
  constructor(scene, onStroke, onCollision) {
    this.model = new THREE.Group()
    this.paddles = addBoatModel(this.model)
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

function addBoatModel(group) {
  const texture = woodTexture()
  const wood = color => new THREE.MeshStandardMaterial({ color, map: texture, roughness: 0.82 })
  const sideWood = wood(0x805739)
  sideWood.side = THREE.DoubleSide
  const dark = wood(0x714a30)
  dark.side = THREE.DoubleSide
  const rail = new THREE.MeshStandardMaterial({ color: 0xb28a5d, vertexColors: true, roughness: 0.74, side: THREE.DoubleSide })
  const decks = [wood(0x93704f), wood(0xb18054), wood(0x856144)]
  const metal = new THREE.MeshStandardMaterial({ color: 0x574d37, roughness: 0.73, metalness: 0.26 })
  const crossSections = [
    [-2.76, 0.035, 0.87], [-2.54, 0.29, 0.71], [-2.12, 0.53, 0.58], [-1.62, 0.67, 0.49],
    [-1.0, 0.77, 0.45], [-0.25, 0.82, 0.44], [0.55, 0.80, 0.45], [1.19, 0.69, 0.50],
    [1.64, 0.49, 0.56], [1.93, 0.28, 0.64], [2.09, 0.035, 0.71],
  ]
  const vertex = ([z, width, height], side, band) => {
    const curve = [0, 0.67, 0.90, 0.97, 1]
    const y = mix(0.005 + Math.abs(z) ** 3 * 0.015, height, [0, 0.22, 0.46, 0.73, 1][band])
    return vec(width * curve[band] * side, y, z)
  }
  for (const side of [-1, 1]) {
    const bounds = crossSections.map(row => vertex(row, side, 4))
    group.add(mesh(tube(bounds, 0.054, 0.051, 26, 6), rail))
    for (let band = 0; band < 4; band++) {
      const points = []
      const uvs = []
      const indices = []
      for (let i = 0; i < crossSections.length; i++) {
        for (let j = 0; j < 2; j++) {
          const point = vertex(crossSections[i], side, band + j)
          points.push(...point)
          uvs.push(i / (crossSections.length - 1), j)
        }
        if (i < crossSections.length - 1) {
          const a = i * 2
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
        }
      }
      const plank = new THREE.BufferGeometry()
      plank.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
      plank.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      plank.setIndex(indices)
      plank.computeVertexNormals()
      group.add(mesh(plank, band % 2 ? sideWood : dark))
    }
  }
  for (let i = 0; i < 16; i++) {
    const z = -2.42 + i * 0.27
    const width = 0.68 * Math.sqrt(Math.max(0.05, 1 - ((z + 0.25) / 2.5) ** 2))
    const board = mesh(new THREE.BoxGeometry(width * 2, 0.048, 0.255), decks[i % 3], 0, 0.105 + z * z * 0.018, z)
    group.add(board)
  }
  for (const [z, size] of [[-1.12, 1.40], [0.64, 1.45]]) {
    group.add(mesh(new THREE.BoxGeometry(size, 0.068, 0.24), decks[1], 0, 0.34, z))
  }
  for (const side of [-1, 1]) {
    group.add(mesh(new THREE.BoxGeometry(0.12, 0.045, 0.24), metal, side * 0.78, 0.47, -1.10))
  }
  const bow = new THREE.BufferGeometry()
  bow.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.849, -2.755, -0.242, 0.692, -2.52, 0.242, 0.692, -2.52,
    -0.460, 0.558, -2.13, 0.460, 0.558, -2.13,
  ], 3))
  bow.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 0.36, 0.2, 0.36, 0.8, 1, 0, 1, 1], 2))
  bow.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4])
  bow.computeVertexNormals()
  group.add(mesh(bow, decks[1]))
  group.add(mesh(tube([vec(0, 0.13, -2.54), vec(0, 0.48, -2.70),
    vec(0, 0.83, -2.77), vec(0, 0.879, -2.743)], 0.057, 0.053, 12, 7), rail))
  const rope = new THREE.MeshStandardMaterial({ color: 0x9b8961, roughness: 1, vertexColors: true })
  const coil = []
  for (let i = 0; i < 68; i++) {
    const t = i / 67
    const angle = t * Math.PI * 10
    const radius = mix(0.145, 0.04, t)
    coil.push(vec(Math.cos(angle) * radius, 0.44 + t * 0.055, -1.78 + Math.sin(angle) * radius * 0.82))
  }
  group.add(mesh(tube(coil, 0.018, 0.017, 100, 5), rope))

  return [-1, 1].map(sign => {
    const pivot = new THREE.Group()
    group.add(pivot)
    const shaft = mesh(new THREE.CylinderGeometry(0.031, 0.042, 2.37, 9),
      decks[1], sign * 0.46, 0, 0)
    shaft.rotation.z = -Math.PI / 2
    pivot.add(shaft)
    const outline = new THREE.Shape()
    outline.moveTo(-0.25, -0.045)
    outline.quadraticCurveTo(-0.08, -0.10, 0.04, -0.12)
    outline.quadraticCurveTo(0.36, -0.185, 0.48, -0.117)
    outline.quadraticCurveTo(0.52, 0, 0.47, 0.12)
    outline.quadraticCurveTo(0.36, 0.175, 0.05, 0.115)
    outline.quadraticCurveTo(-0.10, 0.08, -0.25, 0.045)
    outline.closePath()
    const blade = mesh(new THREE.ExtrudeGeometry(outline, {
      depth: 0.035, bevelThickness: 0.017, bevelSize: 0.016, bevelSegments: 2, curveSegments: 6,
    }), decks[0], sign * 1.56, 0, 0)
    blade.rotation.x = (sign === -1 ? -0.74 : -0.86) * Math.PI
    if (sign === -1) blade.scale.x = -1
    pivot.add(blade)
    return { pivot, blade, hand: addRowingHand(group, pivot, sign) }
  })
}
