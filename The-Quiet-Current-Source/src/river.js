import { RIVER } from './config.js'

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
export const mix = (a, b, amount) => a + (b - a) * amount

export function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let bits = Math.imul(seed ^ (seed >>> 15), seed | 1)
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61)
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296
  }
}

export function center(s) {
  return 13 * Math.sin(s * 0.025 - 0.35) + 5.8 * Math.sin(s * 0.047 + 0.35) + 2.47
}

export function halfWidth(s) {
  return 16.8 + 3.45 * Math.sin(s * 0.043 + 1.04) + 2.75 * Math.sin(s * 0.019 + 0.8)
}

export function heading(s) {
  return Math.atan2(center(s + 0.5) - center(s - 0.5), 1)
}

export function bank(s, side) {
  return center(s) + side * halfWidth(s)
}

export function groundHeight(s, distance, side) {
  const rise = Math.min(8.7, Math.max(0, distance) * 0.28)
  const contours = 0.73 * Math.sin(s * 0.19 + side) * Math.sin(distance * 0.34)
    + 0.38 * Math.sin(distance * 0.7 + s * 0.45)
    + 1.05 * Math.sin(s * 0.048 + side) * Math.min(1, Math.abs(distance) / 12)
  return -0.30 + (distance < 0 ? distance * 0.42 : rise) + contours
}

export const obstacles = [
  [27, -8.6, 2.1, 'rock', 0.3],
  [35, 9.8, 2.65, 'rock', 0.8],
  [56, -6.8, 1.8, 'rock', 0.5],
  [79, 5.9, 1.05, 'log', 0.8, 3.8],
  [102, -8.3, 2.3, 'rock', 1.8],
  [121, 8.0, 2.05, 'rock', 0.7],
  [147, -4.8, 0.85, 'log', 1.25, 3.2],
  [162, 7.4, 2.2, 'rock', 0.6],
  [187, -8.2, 2.05, 'rock', 1.5],
  [215, 3.3, 1.9, 'rock', 2.6],
  [235, -8.1, 0.95, 'log', -0.63, 4.0],
  [264, 7.6, 3.1, 'rock', 1.9],
  [286, -4.3, 1.8, 'rock', 3.1],
  [311, 6.7, 0.9, 'log', 1.5, 3.7],
  [332, -6.5, 2.35, 'rock', 2.8],
  [351, 8.5, 1.85, 'rock', 2.6],
  [376, -6.9, 0.95, 'log', 1.03, 3.0],
  [393, 6.15, 2.25, 'rock', 1.6],
].map(([s, offset, radius, kind, angle, length = 0]) => ({
  s, x: center(s) + offset, radius, kind, angle, length,
  dx: Math.sin(angle), ds: Math.cos(angle),
}))

export const dock = { s: RIVER.dock, x: center(RIVER.dock) + 4.9 }
export const berth = { s: dock.s - 0.35, x: dock.x - 1.45, yaw: 0 }

export function reachedDock(x, s) {
  return x <= dock.x - 0.75 && Math.hypot((x - berth.x) * 0.82, s - berth.s) < 6.1
}
