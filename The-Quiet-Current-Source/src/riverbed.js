import * as THREE from 'three'
import { RIVER } from './config.js'
import { geometry, mesh, stone, tube, vec } from './geometry.js'
import { center, halfWidth, mix, seededRandom } from './river.js'

function elevation(station, across) {
  const middle = Math.max(0, 1 - Math.abs(across + Math.sin(station * 0.067) * 0.11))
  const depth = 0.26 + middle ** 1.55 * (1.50 + Math.sin(station * 0.038) * 0.43)
  return -depth + Math.sin(across * 12 + station * 0.64) * (0.053 + middle * 0.051)
}

export function addRiverbed(scene, layer) {
  const positions = []
  const colors = []
  const indices = []
  const sand = new THREE.Color(0xaf9c72)
  const silt = new THREE.Color(0x72866f)
  const tint = new THREE.Color()
  const columns = 19
  const start = -55
  const step = 2.15
  const rows = Math.ceil((RIVER.sceneryEnd - start) / step)

  for (let row = 0; row <= rows; row++) {
    const station = start + row * step
    const mid = center(station)
    const width = halfWidth(station)
    for (let column = 0; column < columns; column++) {
      const across = column / (columns - 1) * 2.16 - 1.08
      positions.push(mid + across * width, elevation(station, across), -station)
      const variation = 0.5 + 0.5 * Math.sin(station * 0.51 + across * 8.4) * Math.cos(station * 0.15 - across * 12)
      tint.lerpColors(sand, silt, variation * 0.54 + (1 - Math.min(1, Math.abs(across))) * 0.34)
      colors.push(tint.r, tint.g, tint.b)
      if (row < rows && column < columns - 1) {
        const a = row * columns + column
        const b = a + columns
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }

  const clock = { value: 0 }
  const sandMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 })
  sandMaterial.onBeforeCompile = shader => {
    shader.uniforms.bedTime = clock
    shader.vertexShader = 'varying vec3 bedPoint;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nbedPoint = position;',
    )
    shader.fragmentShader = 'uniform float bedTime;\nvarying vec3 bedPoint;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', `
        #include <color_fragment>
        vec2 bed = bedPoint.xz;
        float sandRipple = sin(bed.y*4.0 + bed.x*1.87 + sin(bed.x*0.98)*2.5);
        float fineHaze = 1.-smoothstep(0.9,2.3,fwidth(bed.y*32.0)+fwidth(bed.x*41.0));
        float sandGrain = sin(bed.y*32.0 + sin(bed.x*23.0))*cos(bed.x*41.0)*fineHaze;
        vec2 wave = bed + vec2(sin(bed.y*1.37+bedTime*0.89),sin(bed.x*1.59-bedTime*0.84))*0.24;
        float cell = abs(sin(wave.x*2.6+wave.y*1.18+bedTime*0.43)*sin(wave.y*2.93-wave.x*0.74-bedTime*0.41));
        float caustics = (1.-smoothstep(0.025,0.23,cell)) * (0.62 + sin(wave.x*0.81+wave.y*0.92)*0.38);
        float surfaceLight = (1.-smoothstep(7.,33.,distance(bed,cameraPosition.xz))) *
          (1.-smoothstep(0.08,2.3,-bedPoint.y));
        diffuseColor.rgb *= 0.90 + sandRipple*0.105 + sandGrain*0.064 + caustics*surfaceLight*0.50;
      `,
    )
  }
  const bed = mesh(geometry(positions, colors, indices), sandMaterial)
  bed.name = 'Sand and gravel riverbed'
  bed.receiveShadow = true
  bed.layers.set(layer)
  scene.add(bed)
  addSubmergedDetails(scene, layer)
  return time => { clock.value = time }
}

function addSubmergedDetails(scene, layer) {
  const random = seededRandom(RIVER.seed + 240)
  const pebbles = stone(85, 1)
  const gravel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.87, color: 0xc4c1a8 })
  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, color: 0x6c5138, side: THREE.DoubleSide })
  const tint = new THREE.Color()
  const transform = new THREE.Object3D()
  const batchSize = 38
  const stonesPerBatch = 116
  for (let begin = -30; begin < RIVER.sceneryEnd; begin += batchSize) {
    const detail = new THREE.InstancedMesh(pebbles, gravel, stonesPerBatch)
    detail.layers.set(layer)
    detail.name = 'Riverbed pebbles'
    detail.receiveShadow = true
    for (let i = 0; i < stonesPerBatch; i++) {
      const station = begin + random() * batchSize
      const side = random() < 0.5 ? -1 : 1
      const across = side * mix(0.025, 0.98, random() ** 0.78)
      const radius = mix(0.19, 0.69, random() ** 1.65)
      transform.position.set(center(station) + across * halfWidth(station), elevation(station, across) + 0.035, -station)
      transform.scale.set(radius * mix(0.85, 1.35, random()), radius * 0.35, radius * mix(0.66, 1.24, random()))
      transform.rotation.set(0, random() * Math.PI * 2, 0)
      transform.updateMatrix()
      detail.setMatrixAt(i, transform.matrix)
      tint.setHSL(mix(0.068, 0.36, random()), mix(0.07, 0.30, random()), mix(0.55, 0.84, random()))
      detail.setColorAt(i, tint)
    }
    detail.computeBoundingSphere()
    scene.add(detail)
  }
  for (const [station, across, rotation] of [[7, -0.19, 0.58], [35, 0.46, 1.4], [82, -0.37, 1.2],
    [124, 0.48, -0.86], [172, -0.4, 0.52], [239, 0.45, -1.4], [317, -0.43, 1.65], [395, 0.4, 0.68]]) {
    const branch = tube([vec(0, 0.04, -1.7), vec(0.04, 0.14, -0.25), vec(0.23, 0.0, 0.84), vec(0.52, 0.03, 1.81)],
      0.24, 0.074, 11, 8)
    const fallen = mesh(branch, wood, center(station) + across * halfWidth(station), elevation(station, across) + 0.115, -station)
    fallen.rotation.y = rotation
    fallen.receiveShadow = true
    fallen.layers.set(layer)
    scene.add(fallen)
  }
}
