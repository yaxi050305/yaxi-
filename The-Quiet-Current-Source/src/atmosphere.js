import * as THREE from 'three'
import { VISUALS } from './config.js'
import { seededRandom } from './river.js'
import { mesh, vec } from './geometry.js'

export const sun = vec(...VISUALS.sunDirection).normalize()

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
  const sky = mesh(new THREE.SphereGeometry(565, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDirection: { value: sun }, horizon: { value: new THREE.Color(VISUALS.fogColor) } },
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
      varying vec3 worldPoint;
      ${noiseGLSL}
      void main() {
        vec3 ray = normalize(worldPoint - cameraPosition);
        float height = max(0., ray.y);
        float alignment = max(0., dot(ray, sunDirection));
        vec3 skyColor = mix(horizon * vec3(1.13,1.12,0.94), vec3(0.13,0.29,0.27), smoothstep(0.015,0.57,height));
        vec2 cloudPoint = ray.xz / max(0.13, ray.y + 0.20) * vec2(5., 3.);
        float cloud = noise21(cloudPoint) * 0.65 + noise21(cloudPoint * 2.7) * 0.24 + noise21(cloudPoint * 6.) * 0.11;
        skyColor = mix(skyColor, vec3(0.91,0.82,0.52), smoothstep(0.48,0.88,cloud) * (0.12 + pow(alignment, 6.) * 0.42));
        skyColor += vec3(0.46,0.30,0.085)*pow(alignment,14.);
        skyColor += vec3(0.62,0.36,0.08)*pow(alignment,100.);
        skyColor += vec3(1.0,0.71,0.3)*smoothstep(0.9993,0.99977,alignment)*2.1;
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

  const hemisphere = new THREE.HemisphereLight(0xd4e6bc, 0x4d5536, 1.62)
  const morning = new THREE.DirectionalLight(0xffdf98, 2.15)
  morning.position.copy(sun).multiplyScalar(50)
  const fill = new THREE.DirectionalLight(0xc4d8b7, 0.48)
  fill.position.set(-18, 4, 14)
  scene.add(hemisphere, morning, fill)
}

export function addLightShafts(scene) {
  const random = seededRandom(390)
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 surface;
      void main() {
        surface = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      varying vec2 surface;
      void main() {
        float width = mix(0.13,0.49,surface.y);
        float center = exp(-3.8 * pow((surface.x - 0.5) / width, 2.));
        float ends = smoothstep(0.,0.37,surface.y) * (1. - smoothstep(0.48,1.,surface.y));
        gl_FragColor = vec4(0.95,0.86,0.50,center * ends * 0.102);
        #include <colorspace_fragment>
      }
    `,
  })
  const across = vec(0, 0, 1).cross(sun).normalize()
  for (const s of [25, 44, 112, 160, 228, 310, 395, 423]) {
    for (let i = 0; i < 2; i++) {
      const bottom = vec(-4 + random() * 21, 0.15, -s + i * 2.7)
      const top = bottom.clone().addScaledVector(sun, 29 + random() * 13)
      const leftBottom = bottom.clone().addScaledVector(across, -4.5)
      const rightBottom = bottom.clone().addScaledVector(across, 4.5)
      const leftTop = top.clone().addScaledVector(across, -1.45)
      const rightTop = top.clone().addScaledVector(across, 1.45)
      const beam = new THREE.BufferGeometry()
      beam.setAttribute('position', new THREE.Float32BufferAttribute(
        [...leftTop, ...rightTop, ...leftBottom, ...rightBottom], 3))
      beam.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2))
      beam.setIndex([0, 2, 1, 1, 2, 3])
      scene.add(mesh(beam, material))
    }
  }
}

export { noiseGLSL }
