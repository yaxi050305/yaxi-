import * as THREE from 'three'
import { mesh, tube, vec } from './geometry.js'

const skin = new THREE.MeshStandardMaterial({ color: 0xb57955, roughness: 0.8, side: THREE.DoubleSide })
const crease = new THREE.MeshStandardMaterial({ color: 0x905c40, roughness: 0.85, side: THREE.DoubleSide })
const fabric = new THREE.MeshStandardMaterial({ color: 0x445449, roughness: 0.98 })
const cuffFabric = new THREE.MeshStandardMaterial({ color: 0x536455, roughness: 0.94 })
const knuckle = new THREE.SphereGeometry(1, 10, 7)
const armGeometry = new THREE.CylinderGeometry(0.073, 0.108, 1, 11)
const up = vec(0, 1, 0)

export function addRowingHand(boat, pivot, side) {
  const grip = new THREE.Group()
  grip.name = side < 0 ? 'Left hand on the oar' : 'Right hand on the oar'
  grip.position.x = side * 0.32
  grip.scale.x = side
  pivot.add(grip)

  const palm = mesh(knuckle, skin, 0, 0.065, 0.036)
  palm.scale.set(0.106, 0.057, 0.097)
  palm.rotation.y = -0.14
  grip.add(palm)
  const wrist = mesh(knuckle, skin, 0.018, 0.041, 0.116)
  wrist.scale.set(0.077, 0.058, 0.090)
  grip.add(wrist)

  for (const [index, x] of [-0.070, -0.025, 0.021, 0.062].entries()) {
    const length = [0.82, 1, 0.95, 0.76][index]
    const finger = tube([vec(x, 0.078, 0.028), vec(x, 0.066, -0.042),
      vec(x, 0.025, -0.071 * length), vec(x + 0.004, -0.026 * length, -0.052),
      vec(x + 0.009, -0.039 * length, -0.012)], 0.025, 0.016, 9, 8)
    grip.add(mesh(finger, skin))
    const tip = mesh(knuckle, skin, x + 0.009, -0.039 * length, -0.012)
    tip.scale.set(0.017, 0.017, 0.021)
    grip.add(tip)
  }
  grip.add(mesh(tube([vec(0.073, 0.046, 0.086), vec(0.103, 0.010, 0.040),
    vec(0.118, -0.027, 0.006), vec(0.077, -0.047, -0.019)], 0.038, 0.021, 9, 8), crease))
  const thumb = mesh(knuckle, skin, 0.080, -0.045, -0.019)
  thumb.scale.set(0.027, 0.022, 0.025)
  grip.add(thumb)

  const forearm = mesh(armGeometry, fabric)
  forearm.name = side < 0 ? 'Left sleeve' : 'Right sleeve'
  boat.add(forearm)
  const cuff = mesh(new THREE.CylinderGeometry(0.076, 0.082, 0.076, 11), cuffFabric)
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
