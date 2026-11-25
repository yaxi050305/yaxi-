import * as THREE from 'three'
import { bank, dock, groundHeight, mix, obstacles, seededRandom } from './river.js'
import { combine, mesh, stone, tube, vec, woodTexture } from './geometry.js'

const bark = new THREE.MeshStandardMaterial({ color: 0x69543a, vertexColors: true, roughness: 1, side: THREE.DoubleSide })
const mossStone = new THREE.MeshStandardMaterial({ color: 0x858781, vertexColors: true, roughness: 0.93 })
const brokenWood = new THREE.MeshStandardMaterial({ color: 0x9f8258, roughness: 1 })

function shadowed(model) {
  model.traverse(part => {
    if (!part.isMesh) return
    part.castShadow = true
    part.receiveShadow = true
  })
  return model
}

mossStone.onBeforeCompile = shader => {
  shader.vertexShader = 'varying vec3 rockPoint;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>', '#include <begin_vertex>\nrockPoint = (modelMatrix * vec4(position,1.0)).xyz;',
  )
  shader.fragmentShader = 'varying vec3 rockPoint;\n' + shader.fragmentShader
    .replace('#include <color_fragment>', `
      #include <color_fragment>
      float stoneVein = sin(rockPoint.y*14.1 + rockPoint.x*2.8 + sin(rockPoint.z*11.9)*0.8);
      float stoneGrain = sin(rockPoint.x*36.0 + rockPoint.z*51.0)*cos(rockPoint.y*49.0);
      float dryStone = smoothstep(-0.02,0.79,rockPoint.y);
      diffuseColor.rgb *= (0.91 + stoneVein*0.055 + stoneGrain*0.035) * mix(0.66,1.0,dryStone);
    `)
    .replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor *= mix(0.72,1.0,dryStone);
    `)
}

function deadfall(x, s, angle, length, size) {
  const log = new THREE.Group()
  const start = -length / 2
  const finish = length / 2
  const trunk = [
    tube([vec(0.05, 0.07, start), vec(-0.18, 0.12, -length * 0.15), vec(0.12, -0.025, finish)], size, size * 0.74, 12, 9),
    tube([vec(0, 0.08, 0), vec(0.46, 0.36, 0.5), vec(0.76, 0.59, 0.84)], size * 0.52, size * 0.17, 5, 6),
    tube([vec(0, 0.09, start + 0.6), vec(-0.51, 0.29, start + 0.82), vec(-0.78, 0.35, start + 0.98)],
      size * 0.47, size * 0.07, 5, 6),
  ]
  log.add(mesh(combine(trunk), bark))
  for (const [end, radius] of [[start, size * 0.96], [finish, size * 0.70]]) {
    const cap = mesh(new THREE.CylinderGeometry(radius, radius, 0.055, 8), brokenWood, 0.08, 0.045, end)
    cap.rotation.x = Math.PI / 2
    log.add(cap)
  }
  log.position.set(x, 0.12, -s)
  log.rotation.y = -angle
  return shadowed(log)
}

export function addLandmarks(scene) {
  const random = seededRandom(140)
  const rocks = [stone(162), stone(991), stone(632)]
  for (const object of obstacles) {
    if (object.kind === 'log') {
      scene.add(deadfall(object.x, object.s, object.angle, object.length + 0.65, 0.48))
      continue
    }
    const boulder = mesh(rocks[Math.floor(random() * rocks.length)], mossStone, object.x, 0.27, -object.s)
    boulder.rotation.set(random() * 0.34, object.angle, -0.24 + random() * 0.49)
    boulder.scale.set(object.radius * 1.03, object.radius * mix(0.56, 0.82, random()), object.radius * 0.87)
    scene.add(shadowed(boulder))
    const companion = mesh(rocks[1], mossStone,
      object.x + Math.cos(object.angle) * object.radius * 0.71, -0.05,
      -object.s + Math.sin(object.angle) * object.radius * 0.71)
    companion.scale.setScalar(object.radius * 0.46)
    scene.add(shadowed(companion))
  }

  for (const [s, side, length, angle] of [[14, 1, 7.4, 0.1], [48, -1, 6.8, -0.2], [137, 1, 5.4, 0.3],
    [192, -1, 5.9, -0.1], [256, 1, 6.9, 0.4], [324, -1, 8.0, 0.3], [402, -1, 8.5, -0.4]]) {
    const log = deadfall(bank(s, side) + side * 1.0, s, angle, length, 0.53)
    log.position.y = groundHeight(s, 1, side) + 0.39
    log.rotation.x = 0.11
    scene.add(log)
  }
  addLilies(scene)
  return addDock(scene)
}

function addLilies(scene) {
  const random = seededRandom(961)
  const outline = new THREE.Shape()
  outline.moveTo(0, 0)
  for (let i = 0; i <= 16; i++) {
    const angle = 0.32 + i / 16 * (Math.PI * 2 - 0.54)
    outline.lineTo(Math.cos(angle) * (1 + Math.sin(i * 0.7) * 0.041), Math.sin(angle) * 0.80)
  }
  outline.closePath()
  const shape = new THREE.ShapeGeometry(outline)
  shape.rotateX(-Math.PI / 2)
  const clusters = []
  const colors = [0x5c6f38, 0x727d40, 0x425a32, 0x929353].map(value => new THREE.Color(value))
  for (const [s, side] of [[14, 1], [20, -1], [41, 1], [72, -1], [97, 1], [139, -1], [183, 1],
    [245, -1], [285, 1], [335, -1], [380, 1], [410, 1]]) {
    for (let i = 0; i < 21; i++) {
      const spread = s + random() * 8
      const x = bank(spread, side) - side * (0.35 + random() * 4.2)
      clusters.push([x, spread, mix(0.13, 0.48, random()), random() * Math.PI * 2])
    }
  }
  const lilies = new THREE.InstancedMesh(shape, new THREE.MeshStandardMaterial({ roughness: 0.67, side: THREE.DoubleSide }), clusters.length)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < clusters.length; i++) {
    const [x, s, size, angle] = clusters[i]
    dummy.position.set(x, 0.015 + random() * 0.015, -s)
    dummy.rotation.y = angle
    dummy.scale.setScalar(size)
    dummy.updateMatrix()
    lilies.setMatrixAt(i, dummy.matrix)
    lilies.setColorAt(i, colors[i % colors.length])
  }
  scene.add(lilies)
}

function addDock(scene) {
  const dockGroup = new THREE.Group()
  dockGroup.position.set(dock.x, 0, -dock.s)
  scene.add(dockGroup)
  const random = seededRandom(520)
  const texture = woodTexture()
  const wood = [0x614a34, 0x806041, 0x97754f, 0x4d3e30].map(color => (
    new THREE.MeshStandardMaterial({ color, map: texture, roughness: 0.94 })
  ))
  const roof = new THREE.MeshStandardMaterial({ color: 0x534833, roughness: 0.98 })
  const post = new THREE.CylinderGeometry(0.15, 0.23, 2.40, 8)
  const shore = bank(dock.s, 1) - dock.x + 3.6
  for (let x = 1.4; x < shore; x += 0.39) {
    const board = mesh(new THREE.BoxGeometry(0.365, 0.13, mix(2.55, 2.79, random())),
      wood[Math.floor(random() * wood.length)], x, 0.77, (random() - 0.5) * 0.1)
    board.rotation.y = (random() - 0.5) * 0.09
    dockGroup.add(board)
  }
  for (let x = 1.55; x < shore; x += 2.8) {
    for (const side of [-1, 1]) {
      const pillar = mesh(post, wood[0], x, 0.42, side * 1.34)
      pillar.rotation.z = (random() - 0.5) * 0.15
      dockGroup.add(pillar)
    }
  }
  for (let i = 0; i < 4; i++) {
    dockGroup.add(mesh(new THREE.BoxGeometry(0.36, 0.11, 1.62), wood[2], i * 0.32, 0.16 + i * 0.17, 0))
  }
  const hutX = shore - 0.65
  for (const dx of [-1.65, 1.65]) {
    for (const z of [-1.69, 1.69]) dockGroup.add(mesh(new THREE.BoxGeometry(0.18, 3.5, 0.18), wood[0], hutX + dx, 2.44, z))
  }
  for (let i = 0; i < 10; i++) {
    dockGroup.add(mesh(new THREE.BoxGeometry(0.32, 2.34 + random() * 0.18, 0.11), wood[i % wood.length],
      hutX + i * 0.33 - 1.49, 1.99, -1.66))
  }
  for (const side of [-1, 1]) {
    const slope = mesh(new THREE.BoxGeometry(4.39, 0.22, 2.86), roof, hutX, 4.09, side * 1.04)
    slope.rotation.x = side * 0.47
    dockGroup.add(slope)
    for (let i = 0; i < 19; i++) {
      const thatch = mesh(new THREE.BoxGeometry(0.095, 0.13, 2.92 + random() * 0.23), wood[i % wood.length],
        hutX - 2.10 + i * 0.23, 4.20, side * 1.04)
      thatch.rotation.x = side * 0.47
      dockGroup.add(thatch)
    }
  }
  dockGroup.add(mesh(new THREE.BoxGeometry(0.15, 2.48, 0.15), wood[0], 1.56, 1.72, -1.38))
  dockGroup.add(mesh(new THREE.BoxGeometry(0.61, 0.11, 0.13), wood[0], 1.56, 2.96, -1.57))
  const lanternColor = new THREE.Color(0xffae59)
  const glow = new THREE.MeshBasicMaterial({ color: lanternColor })
  dockGroup.add(mesh(new THREE.BoxGeometry(0.23, 0.29, 0.23), glow, 1.56, 2.65, -1.54))
  const light = new THREE.PointLight(0xffb35c, 3.8, 8, 2)
  light.position.set(1.56, 2.67, -1.54)
  dockGroup.add(light)
  shadowed(dockGroup)
  return progress => {
    const lit = THREE.MathUtils.smoothstep(progress, 0.64, 0.99)
    light.intensity = mix(3.8, 16, lit)
    glow.color.copy(lanternColor).multiplyScalar(mix(0.36, 2.45, lit))
  }
}

export function addFarRidges(scene) {
  const material = new THREE.MeshBasicMaterial({ color: 0x718878, side: THREE.DoubleSide })
  const positions = []
  const indices = []
  for (let i = 0; i <= 60; i++) {
    const x = -150 + i * 5
    const z = -545 - Math.sin(i * 0.11) * 15
    const peak = 14 + Math.sin(i * 0.19) * 9 + Math.sin(i * 0.36) * 4 + Math.sin(i * 1.68) * 1.9
    positions.push(x, -3, z, x, peak, z)
    const a = i * 2
    if (i < 60) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const ridge = new THREE.BufferGeometry()
  ridge.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  ridge.setIndex(indices)
  scene.add(mesh(ridge, material))
}
