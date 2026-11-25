import * as THREE from 'three'
import { RIVER, VISUALS } from './config.js'
import { Boat } from './boat.js'
import { Crocodiles } from './crocodiles.js'
import { RiverAudio } from './audio.js'
import { addSky, addLightShafts } from './atmosphere.js'
import { addJungle, jungleLayers } from './jungle.js'
import { addFarRidges, addLandmarks } from './landmarks.js'
import { berth, clamp, dock, reachedDock } from './river.js'
import { createUI } from './ui.js'
import { Water } from './water.js'
import './style.css'

const root = document.querySelector('#game')
const audio = new RiverAudio()
const keys = [false, false]
const mouse = [false, false]
const touch = [false, false]
const buffered = [0, 0]
const inputs = [false, false]
let mode = 'intro'
let time = 0
let playTime = 0
let boat
let water
let crocodiles
let markerPoint
let touchLook

const ui = createUI(root, {
  start,
  pause,
  sound: () => audio.toggle(),
  touch: (side, down) => setInput(touch, side, down),
})
ui.setMode(mode)

function setInput(source, side, down) {
  if (down && !source[side]) buffered[side] = 0.31
  source[side] = down
}

function clearInputs() {
  for (const input of [keys, mouse, touch, inputs]) input.fill(false)
  buffered.fill(0)
  touchLook = undefined
}

function changeMode(state) {
  mode = state
  clearInputs()
  audio.setPaused(mode === 'paused')
  ui.setMode(mode, mode === 'finished' ? { seconds: playTime, strokes: boat.strokeCount, distance: RIVER.dock - RIVER.start } : undefined)
}

function start() {
  boat.reset()
  water.reset()
  crocodiles.reset()
  playTime = 0
  changeMode('playing')
}

function pause() {
  if (mode === 'playing') changeMode('paused')
  else if (mode === 'paused') changeMode('playing')
}

function keySide(code) {
  return code === 'KeyA' ? 0 : code === 'KeyD' ? 1 : -1
}

function connectInput(canvas) {
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault()
      pause()
    }
    const side = keySide(event.code)
    if (mode !== 'playing' || side === -1) return
    event.preventDefault()
    if (!event.repeat) setInput(keys, side, true)
  })
  window.addEventListener('keyup', event => {
    const side = keySide(event.code)
    if (side !== -1) setInput(keys, side, false)
  })
  canvas.addEventListener('contextmenu', event => event.preventDefault())
  canvas.addEventListener('mousedown', event => {
    if (mode === 'playing' && (event.button === 0 || event.button === 2)) {
      event.preventDefault()
      setInput(mouse, event.button / 2, true)
    }
  })
  window.addEventListener('mouseup', event => {
    if (event.button === 0 || event.button === 2) setInput(mouse, event.button / 2, false)
  })
  canvas.addEventListener('pointermove', event => {
    if (mode !== 'playing') return
    if (event.pointerType === 'mouse') {
      boat.aim(clamp(event.movementX, -60, 60), clamp(event.movementY, -60, 60))
    } else if (touchLook?.id === event.pointerId) {
      boat.aim(event.clientX - touchLook.x, event.clientY - touchLook.y)
      touchLook.x = event.clientX
      touchLook.y = event.clientY
    }
  })
  canvas.addEventListener('pointerdown', event => {
    if (mode !== 'playing' || event.pointerType === 'mouse') return
    event.preventDefault()
    touchLook = { id: event.pointerId, x: event.clientX, y: event.clientY }
    canvas.setPointerCapture(event.pointerId)
  })
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(name, event => {
      if (touchLook?.id === event.pointerId) touchLook = undefined
    })
  }
  window.addEventListener('blur', () => {
    if (mode === 'playing') pause()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'playing') pause()
  })
}

function projectDock(camera) {
  if (Math.abs(dock.s - boat.s) > 98) return undefined
  markerPoint.set(dock.x + 1.55, 3.55, -dock.s - 1.54)
  markerPoint.project(camera)
  if (markerPoint.z < -1 || markerPoint.z > 1 || Math.abs(markerPoint.x) > 0.91 || Math.abs(markerPoint.y) > 0.72) {
    return undefined
  }
  return { x: (markerPoint.x + 1) * 50, y: (1 - markerPoint.y) * 50 }
}

function launch() {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  } catch {
    ui.error()
    return
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = VISUALS.exposure
  renderer.domElement.setAttribute('aria-hidden', 'true')
  ui.view.append(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(VISUALS.fogColor)
  scene.fog = new THREE.FogExp2(VISUALS.fogColor, VISUALS.fogDensity)
  const camera = new THREE.PerspectiveCamera(61, 1, 0.055, 580)
  camera.layers.enable(jungleLayers.view)
  markerPoint = new THREE.Vector3()
  addSky(scene)
  addFarRidges(scene)
  const prepareVegetation = addJungle(scene)
  addLandmarks(scene)
  addLightShafts(scene)
  water = new Water(scene)
  water.reflectedCamera.layers.enable(jungleLayers.reflection)
  crocodiles = new Crocodiles(scene)
  boat = new Boat(scene, (x, z, side) => {
    water.ripple(x, z, 0.90, true)
    audio.splash(side)
  }, (kind, force) => {
    water.ripple(boat.x, -boat.s, force * 0.85, true)
    audio.collision(kind, force)
    ui.collision(force)
  })
  connectInput(renderer.domElement)

  function resize() {
    const width = Math.max(1, root.clientWidth)
    const height = Math.max(1, root.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, VISUALS.pixelRatio))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.fov = width < height ? clamp(76 + (0.48 - camera.aspect) * 40, 76, 84) : 61
    camera.updateProjectionMatrix()
    water.resize(width, height)
  }
  window.addEventListener('resize', resize)
  resize()

  let lastFrame = performance.now()
  let pausedFrame = false
  let lastWidth = root.clientWidth
  let lastHeight = root.clientHeight
  renderer.setAnimationLoop(now => {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.045)
    lastFrame = now
    const resized = lastWidth !== root.clientWidth || lastHeight !== root.clientHeight
    lastWidth = root.clientWidth
    lastHeight = root.clientHeight
    if (mode === 'paused' && pausedFrame && !resized) return
    pausedFrame = mode === 'paused'
    if (mode !== 'paused') time += dt
    if (mode === 'intro') {
      boat.viewYaw = -0.18 + Math.sin(time * 0.13) * 0.025
      boat.viewPitch = 0.022
    }
    if (mode === 'playing') {
      playTime += dt
      for (const side of [0, 1]) {
        inputs[side] = keys[side] || mouse[side] || touch[side] || buffered[side] > 0
        buffered[side] = Math.max(0, buffered[side] - dt)
      }
      const clocks = boat.strokeClock.slice()
      boat.update(dt, inputs)
      for (const side of [0, 1]) {
        if (boat.strokeClock[side] < clocks[side]) buffered[side] = 0
      }
      const crossing = crocodiles.update(dt, boat, (x, z) => water.ripple(x, z, 0.32))
      ui.crossing(crossing.nearby)
      if (crossing.hit) {
        water.ripple(boat.x, -boat.s, 1.3, true)
        audio.collision('log', 1)
        ui.collision(1)
        boat.stop()
        changeMode('failed')
      } else if (reachedDock(boat.x, boat.s)) {
        boat.beginDocking()
        changeMode('docking')
      }
    } else if (mode === 'docking') {
      playTime += dt
      if (boat.updateDocking(dt)) changeMode('finished')
    }
    boat.pose(time, camera)
    camera.updateMatrixWorld(true)
    if (mode === 'playing') {
      const distance = boat.s < RIVER.dock - 20 ? RIVER.dock - boat.s : Math.hypot(berth.x - boat.x, berth.s - boat.s)
      const percent = clamp((boat.s - RIVER.start) / (RIVER.dock - RIVER.start) * 100, 0, 99)
      ui.update(distance, percent, playTime < 16 || boat.strokeCount < 5, projectDock(camera))
    }
    water.update(time, mode === 'paused' ? 0 : dt, boat, mode === 'playing' || mode === 'docking')
    water.reflect(renderer, scene, camera, boat.model, prepareVegetation)
    prepareVegetation(camera)
    renderer.render(scene, camera)
  })
}

launch()
