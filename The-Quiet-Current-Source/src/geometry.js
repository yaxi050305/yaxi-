import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const vec = (x, y, z) => new THREE.Vector3(x, y, z)

export function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material)
  object.position.set(x, y, z)
  return object
}

export function tube(points, radius, endRadius, segments = 7, sides = 6) {
  const path = new THREE.CatmullRomCurve3(points)
  const frames = path.computeFrenetFrames(segments, false)
  const positions = []
  const colors = []
  const indices = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const point = path.getPointAt(t)
    const width = THREE.MathUtils.lerp(radius, endRadius, t)
    for (let j = 0; j < sides; j++) {
      const angle = j * Math.PI * 2 / sides
      const roughness = 1 + 0.12 * Math.sin(j * 7.3 + i * 0.8)
      const vertex = point.clone()
        .addScaledVector(frames.normals[i], width * roughness * Math.cos(angle))
        .addScaledVector(frames.binormals[i], width * roughness * Math.sin(angle))
      positions.push(vertex.x, vertex.y, vertex.z)
      const shade = 0.62 + 0.35 * (0.5 + 0.5 * Math.sin(j * 13.8 + i * 0.28))
      colors.push(shade, shade * 0.98, shade * 0.91)
      if (i === segments) continue
      const a = i * sides + j
      const b = i * sides + (j + 1) % sides
      indices.push(a, b, a + sides, b, b + sides, a + sides)
    }
  }
  return geometry(positions, colors, indices)
}

export function geometry(positions, colors, indices) {
  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  if (indices) result.setIndex(indices)
  result.computeVertexNormals()
  return result
}

export function combine(parts) {
  const result = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  return result
}

export function stone(seed, detail = 2) {
  const result = new THREE.IcosahedronGeometry(1, detail)
  const points = result.attributes.position
  const colors = []
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i)
    const y = points.getY(i)
    const z = points.getZ(i)
    const noise = Math.sin(x * 9.3 + z * 7.8 + seed) * Math.cos(y * 9 + x * 3.7)
    const broad = Math.sin(x * 4 - y * 3 + z * 2 + seed)
    const scale = 1 + noise * 0.12 + broad * 0.19
    points.setXYZ(i, x * scale + y * 0.13, y * scale + 0.07 * broad, z * scale)
    const moss = THREE.MathUtils.smoothstep(y + noise * 0.48, 0.18, 0.73)
    const shade = 0.61 + 0.21 * noise + 0.12 * Math.sin(y * 29 + seed)
    const color = new THREE.Color().setRGB(shade * 0.88, shade * 0.94, shade * 0.91)
      .lerp(new THREE.Color(0x71884a), moss * 0.92)
    colors.push(color.r, color.g, color.b)
  }
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  result.computeVertexNormals()
  return result
}

export function woodTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')
  context.fillStyle = '#b19770'
  context.fillRect(0, 0, 512, 128)
  for (let line = 0; line < 240; line++) {
    const y = ((line * 13.31) % 128)
    const phase = line * 1.791
    context.beginPath()
    for (let x = 0; x <= 512; x += 4) {
      const bend = Math.sin(x * 0.014 + phase) * 1.6 + Math.sin(x * 0.043 + phase * 4) * 0.46
      if (x === 0) context.moveTo(x, y + bend)
      else context.lineTo(x, y + bend)
    }
    context.strokeStyle = line % 3 ? 'rgba(57,38,26,0.17)' : 'rgba(241,209,157,0.34)'
    context.lineWidth = line % 11 === 0 ? 1.6 : 0.55
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
