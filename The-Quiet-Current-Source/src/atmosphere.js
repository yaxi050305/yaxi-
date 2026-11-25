import * as THREE from 'three'
import { VISUALS } from './config.js'
import { seededRandom } from './river.js'
import { mesh, vec } from './geometry.js'

export const sun = vec(...VISUALS.sunDirection).normalize()
export const sunTint = new THREE.Color(0xffbe72)

const color = value => new THREE.Color(value)
const goldenHour = {
  at: 0, position: sun.clone(), fog: color(VISUALS.fogColor), density: VISUALS.fogDensity,
  horizon: color(0xffbd78), sky: color(0x578ec5), cloud: color(0xffd199), glow: color(0xffb66a),
  key: color(0xffe2b0), bounce: color(0xd5e4f4), ground: color(0x738351), keyIntensity: 2.42,
}
const sunset = {
  at: 0.56, position: vec(0.57, 0.16, -0.80).normalize(), fog: color(0xc5b7a7), density: 0.0094,
  horizon: color(0xff9272), sky: color(0x7185c2), cloud: color(0xffaed0), glow: color(0xff9856),
  key: color(0xffc696), bounce: color(0xd9ddff), ground: color(0x737e56), keyIntensity: 2.15,
}
const dusk = {
  at: 1, position: vec(0.61, 0.064, -0.79).normalize(), fog: color(0xb6b0cf), density: 0.0100,
  horizon: color(0xf2a1c4), sky: color(0x6d78b8), cloud: color(0xffb8cf), glow: color(0xffad99),
  key: color(0xffbea6), bounce: color(0xc9d8fe), ground: color(0x747557), keyIntensity: 1.71,
}

const noiseGLSL = `
float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}
float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 g = fract(p);
  g = g*g*(3.0-2.0*g);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),g.x),mix(hash21(i+vec2(0,1)),hash21(i+1.0),g.x),g.y);
}`

export function addSky(scene) {
  const uniforms = {
    sunDirection: { value: sun },
    horizon: { value: goldenHour.horizon.clone() },
    zenith: { value: goldenHour.sky.clone() },
    cloudTone: { value: goldenHour.cloud.clone() },
    glow: { value: sunTint },
  }
  const sky = mesh(new THREE.SphereGeometry(565, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 worldPoint;
      void main() {
        worldPoint = (modelMatrix * vec4(position, 1.)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform vec3 horizon;
      uniform vec3 zenith;
      uniform vec3 cloudTone;
      uniform vec3 glow;
      varying vec3 worldPoint;
      ${noiseGLSL}
      void main() {
        vec3 ray = normalize(worldPoint - cameraPosition);
        float height = max(0., ray.y);
        float alignment = max(0., dot(ray, sunDirection));
        vec3 skyColor = mix(horizon * 0.96, zenith * 1.07, smoothstep(0.08,0.51,height));
        vec2 cloudPoint = ray.xz / max(0.16, ray.y + 0.27) * vec2(4., 2.8);
        float cloud = noise21(cloudPoint) * 0.56 + noise21(cloudPoint * 2.8) * 0.30 + noise21(cloudPoint * 6.5) * 0.14;
        float cloudShape = smoothstep(0.49,0.73,cloud) * (1.-smoothstep(0.43,0.76,height));
        skyColor = mix(skyColor, cloudTone * (0.76 + cloud * 0.35), cloudShape * (0.39 + pow(alignment, 8.) * 0.28));
        skyColor += glow * (pow(alignment,18.)*0.24 + pow(alignment,128.)*0.56);
        skyColor += mix(glow,vec3(1.,0.92,0.71),0.7) * smoothstep(0.99964,0.99980,alignment) * 2.5;
        gl_FragColor = vec4(skyColor,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }))
  sky.frustumCulled = false
  sky.renderOrder = 10
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    sky.position.copy(camera.position)
    sky.updateMatrixWorld()
  }
  scene.add(sky)

  const hemisphere = new THREE.HemisphereLight(0xd5e4f4, 0x738351, 1.75)
  const sunlight = new THREE.DirectionalLight(0xffe2b0, goldenHour.keyIntensity)
  const fill = new THREE.DirectionalLight(0xb9dfeb, 0.55)
  fill.position.set(-18, 1.5, 14)
  sunlight.name = 'Sunset light and local shadows'
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(1536, 1536)
  Object.assign(sunlight.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 0.35, far: 103 })
  sunlight.shadow.bias = -0.00013
  sunlight.shadow.normalBias = 0.012
  sunlight.shadow.radius = 2.1
  sunlight.shadow.intensity = 0.74
  scene.add(hemisphere, sunlight, sunlight.target, fill)

  const updateSunset = progress => {
    const [from, to] = progress < sunset.at ? [goldenHour, sunset] : [sunset, dusk]
    const blend = THREE.MathUtils.smoothstep(progress, from.at, to.at)
    sun.lerpVectors(from.position, to.position, blend).normalize()
    sunTint.lerpColors(from.glow, to.glow, blend)
    uniforms.horizon.value.lerpColors(from.horizon, to.horizon, blend)
    uniforms.zenith.value.lerpColors(from.sky, to.sky, blend)
    uniforms.cloudTone.value.lerpColors(from.cloud, to.cloud, blend)
    scene.fog.color.lerpColors(from.fog, to.fog, blend)
    scene.fog.density = THREE.MathUtils.lerp(from.density, to.density, blend)
    scene.background.copy(scene.fog.color)
    hemisphere.color.lerpColors(from.bounce, to.bounce, blend)
    hemisphere.groundColor.lerpColors(from.ground, to.ground, blend)
    sunlight.color.lerpColors(from.key, to.key, blend)
    sunlight.intensity = THREE.MathUtils.lerp(from.keyIntensity, to.keyIntensity, blend)
    sunlight.position.copy(sunlight.target.position).addScaledVector(sun, 50)
  }
  const placeShadow = boat => {
    const centerX = boat.x + Math.sin(boat.yaw) * 6
    const centerZ = -boat.s - Math.cos(boat.yaw) * 6
    sunlight.target.position.set(Math.round(centerX * 20) / 20, 0.4, Math.round(centerZ * 20) / 20)
    sunlight.position.copy(sunlight.target.position).addScaledVector(sun, 50)
  }
  updateSunset(0)
  return { updateSunset, placeShadow }
}

export function addLightShafts(scene) {
  const random = seededRandom(390)
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { sunDirection: { value: sun }, sunTint: { value: sunTint } },
    vertexShader: `
      varying vec2 surface;
      uniform vec3 sunDirection;
      attribute vec3 beamOrigin;
      attribute float beamLength;
      void main() {
        surface = uv;
        vec3 point = position + beamOrigin + sunDirection * beamLength * (1. - uv.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.);
      }
    `,
    fragmentShader: `
      varying vec2 surface;
      uniform vec3 sunTint;
      void main() {
        float width = mix(0.13,0.49,surface.y);
        float center = exp(-3.8 * pow((surface.x - 0.5) / width, 2.));
        float ends = smoothstep(0.,0.37,surface.y) * (1. - smoothstep(0.48,1.,surface.y));
        gl_FragColor = vec4(sunTint,center * ends * 0.072);
        #include <colorspace_fragment>
      }
    `,
  })
  const across = vec(0.78, 0, 0.62).normalize()
  for (const s of [25, 44, 112, 160, 228, 310, 395, 423]) {
    for (let i = 0; i < 2; i++) {
      const bottom = vec(-4 + random() * 21, 0.15, -s + i * 2.7)
      const length = 29 + random() * 13
      const leftBottom = across.clone().multiplyScalar(-4.5)
      const rightBottom = across.clone().multiplyScalar(4.5)
      const leftTop = across.clone().multiplyScalar(-1.45)
      const rightTop = across.clone().multiplyScalar(1.45)
      const beam = new THREE.BufferGeometry()
      beam.setAttribute('position', new THREE.Float32BufferAttribute(
        [...leftTop, ...rightTop, ...leftBottom, ...rightBottom], 3))
      beam.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2))
      beam.setAttribute('beamOrigin', new THREE.Float32BufferAttribute([...bottom, ...bottom, ...bottom, ...bottom], 3))
      beam.setAttribute('beamLength', new THREE.Float32BufferAttribute([length, length, length, length], 1))
      beam.setIndex([0, 2, 1, 1, 2, 3])
      beam.boundingSphere = new THREE.Sphere(bottom.clone().addScaledVector(sun, length / 2), length * 0.62)
      const shaft = mesh(beam, material)
      shaft.renderOrder = 6
      scene.add(shaft)
    }
  }
}

export { noiseGLSL }
