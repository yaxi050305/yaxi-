import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

export const vec = (x, y, z) => new THREE.Vector3(x, y, z)

export function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material)
  object.position.set(x, y, z)
  return object
}

export function tube(points, radius, endRadius, segments = 7, sides = 6, unevenness = 0.12) {
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
      const roughness = 1 + unevenness * Math.sin(j * 7.3 + i * 0.8)
      const vertex = point.clone()
        .addScaledVector(frames.normals[i], width * roughness * Math.cos(angle))
        .addScaledVector(frames.binormals[i], width * roughness * Math.sin(angle))
      positions.push(vertex.x, vertex.y, vertex.z)
      const shade = 0.795 + 0.175 * (unevenness / 0.12) * Math.sin(j * 13.8 + i * 0.28)
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
  result.deleteAttribute('uv')
  result.deleteAttribute('normal')
  const welded = mergeVertices(result, 0.0001)
  welded.computeVertexNormals()
  result.dispose()
  return welded
}

export function woodTexture(detail = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')
  const base = context.createLinearGradient(0, 0, 0, 256)
  base.addColorStop(0, detail ? '#bababa' : '#9e7b5d')
  base.addColorStop(0.16, detail ? '#dcdcdc' : '#b39576')
  base.addColorStop(0.41, detail ? '#d0d0d0' : '#bb9d7d')
  base.addColorStop(0.7, detail ? '#d9d9d9' : '#ae8e70')
  base.addColorStop(1, detail ? '#c3c3c3' : '#98775a')
  context.fillStyle = base
  context.fillRect(0, 0, 1024, 256)
  for (let line = 0; line < 480; line++) {
    const y = (line * 17.31) % 256
    const phase = line * 1.791
    context.beginPath()
    for (let x = 0; x <= 1024; x += 5) {
      const knot = Math.exp(-(((x - 714) / 135) ** 2 + ((y - 79) / 49) ** 2)) * (y < 79 ? -1 : 1)
      const bend = Math.sin(x * 0.004 + phase * 0.21) * 3.3 + Math.sin(x * 0.021 + phase * 2) * 0.88 + knot * 9.5
      if (x === 0) context.moveTo(x, y + bend)
      else context.lineTo(x, y + bend)
    }
    const contrast = (0.057 + (line % 11) * 0.007).toFixed(3)
    const thread = line % 3 ? (detail ? '67,67,67' : '66,41,23') : (detail ? '246,246,246' : '240,221,190')
    context.strokeStyle = `rgba(${thread},${contrast})`
    context.lineWidth = line % 13 === 0 ? 1.55 : 0.62
    context.stroke()
  }
  for (let mark = 0; mark < 38; mark++) {
    const x = (mark * 151.9) % 990
    const y = (mark * 61.7) % 254
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + (mark % 8 + 1) * 5.6, y + Math.sin(mark * 3.2) * 2.6)
    context.strokeStyle = detail ? 'rgba(252,252,252,0.21)' : 'rgba(229,204,166,0.25)'
    context.lineWidth = mark % 5 === 0 ? 1.05 : 0.48
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = detail ? THREE.NoColorSpace : THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
