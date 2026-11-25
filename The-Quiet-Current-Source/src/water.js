import * as THREE from 'three'
import { RIVER, VISUALS } from './config.js'
import { noiseGLSL, sun } from './atmosphere.js'
import { mesh, vec } from './geometry.js'
import { seededRandom } from './river.js'

const RIPPLE_COUNT = 14
const makeRipples = () => Array.from({ length: RIPPLE_COUNT }, () => new THREE.Vector4(0, 0, -100, 0))

export class Water {
  constructor(scene) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true })
    this.reflectedCamera = new THREE.PerspectiveCamera()
    this.clip = [new THREE.Plane(vec(0, 1, 0), 0.05)]
    this.direction = vec(0, 0, 0)
    this.ripples = makeRipples()
    this.rippleIndex = 0
    this.frame = 0
    this.time = 0
    this.uniforms = {
      riverTime: { value: 0 },
      mirror: { value: this.target.texture },
      mirrorProjection: { value: new THREE.Matrix4() },
      sunDirection: { value: sun },
      mistColor: { value: new THREE.Color(VISUALS.fogColor) },
      mistDensity: { value: VISUALS.fogDensity },
      ripples: { value: makeRipples() },
      rippleCount: { value: 0 },
      boatWake: { value: new THREE.Vector4() },
      wakeSpeed: { value: 0 },
    }
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec3 worldPoint;
        varying vec4 mirrorPoint;
        uniform mat4 mirrorProjection;
        void main() {
          vec4 point = modelMatrix * vec4(position, 1.);
          worldPoint = point.xyz;
          mirrorPoint = mirrorProjection * point;
          gl_Position = projectionMatrix * viewMatrix * point;
        }
      `,
      fragmentShader: `
        varying vec3 worldPoint;
        varying vec4 mirrorPoint;
        uniform sampler2D mirror;
        uniform float riverTime;
        uniform vec3 sunDirection;
        uniform vec3 mistColor;
        uniform float mistDensity;
        uniform vec4 ripples[${RIPPLE_COUNT}];
        uniform int rippleCount;
        uniform vec4 boatWake;
        uniform float wakeSpeed;
        ${noiseGLSL}

        void main() {
          vec2 p = worldPoint.xz;
          vec3 sight = cameraPosition - worldPoint;
          float distanceToEye = length(sight);
          vec3 viewDirection = sight / max(0.01,distanceToEye);
          float t = riverTime;
          float waves = sin(p.x*2.15 + p.y*4.4 + t*1.3);
          float crossWave = sin(p.x*4.8 - p.y*7.1 + t*1.53);
          float breeze = noise21(p * vec2(0.27,0.68) + vec2(t*0.09,-t*0.15));
          float swale = noise21(p * vec2(0.14,0.37) - vec2(t*0.071,t*0.09));
          vec2 tilt = vec2(waves*0.022 + crossWave*0.009 + (breeze-0.5)*0.077,
                          waves*0.037 - crossWave*0.022 + (swale-0.5)*0.075);
          float foam = 0.;
          for (int i = 0; i < ${RIPPLE_COUNT}; i++) {
            if (i >= rippleCount) break;
            vec4 ripple = ripples[i];
            float age = t - ripple.z;
            vec2 delta = p-ripple.xy;
            // Beyond this margin the ring multiplier is below normal float32 precision.
            float outer = age * 1.16 + 16.12;
            if (dot(delta,delta) > outer*outer) continue;
            float radial = distance(p,ripple.xy);
            float front = radial - age * 1.16 - 0.12;
            float fade = max(0., 1. - age / 2.7) * ripple.w;
            float ring = exp(-abs(front)*6.0) * fade;
            tilt += normalize(p-ripple.xy+vec2(0.001))*sin(front*16.)*ring*0.068;
            foam += (exp(-abs(front)*31.) + exp(-abs(front+0.28)*35.)*0.48)*fade*0.14;
          }
          if (wakeSpeed > 0.) {
            vec2 trail = p - boatWake.xy;
            float back = dot(trail, -boatWake.zw);
            if (back > 0. && back < 6.5) {
              float across = abs(dot(trail, vec2(-boatWake.w,boatWake.z)));
              float alongWake = smoothstep(0.,0.9,back) * (1.-smoothstep(2.,6.5,back));
              float wakeEdge = across - back*0.27 - 0.37;
              float wake = exp(-abs(wakeEdge)*9.) * alongWake * wakeSpeed;
              tilt.y += wake*sin(back*14.-t*5.)*0.055;
              foam += wake*0.052;
            }
          }

          vec3 normal = normalize(vec3(tilt.x,1.,tilt.y));
          float fresnel = pow(1.-clamp(dot(normal, viewDirection),0.,1.),3.2);
          vec2 uv = mirrorPoint.xy / mirrorPoint.w * 0.5 + 0.5;
          vec2 distortion = tilt * vec2(0.081,0.083) * (0.55 + fresnel);
          uv = clamp(uv + distortion, 0.002, 0.998);
          vec3 reflected = texture2D(mirror,uv).rgb;
          vec3 body = mix(vec3(0.030,0.070,0.052),vec3(0.110,0.143,0.072),breeze*0.83+swale*0.17);
          vec3 color = mix(body, reflected*vec3(0.61,0.76,0.69), 0.41 + 0.48*fresnel);

          float pattern = noise21(p*vec2(0.53,2.8)+vec2(t*0.035,t*0.24));
          float fine = noise21(p*vec2(0.64,12.7)+vec2(0.,t*0.29));
          float furrows = sin(p.y*9.7 + p.x*0.84 + pattern*7. + t*1.25)*0.5+0.5;
          float distanceFade = 1.-smoothstep(13.,75.,distanceToEye);
          color += vec3(0.077,0.100,0.073) * smoothstep(0.33,0.73,pattern) * pow(furrows,4.) * distanceFade;
          color -= vec3(0.019,0.031,0.029) * smoothstep(0.38,0.84,fine) * distanceFade;
          vec3 reflectedRay = reflect(-viewDirection,normal);
          float specular = pow(max(dot(reflectedRay,sunDirection),0.),82.);
          float bearing = dot(normalize(sight.xz+0.001),normalize(-sunDirection.xz));
          float sheen = pow(max(0.,bearing),19.) * smoothstep(4.,28.,distanceToEye) * (1.-smoothstep(53.,101.,distanceToEye));
          float glints = smoothstep(0.53,0.90,pattern*0.64+fine*0.36) * pow(furrows,2.3);
          color += vec3(0.85,0.58,0.19) * (specular*0.30 + sheen*glints*0.36 + sheen*0.023);

          float s = -p.y;
          float center = 13.*sin(s*0.025-0.35)+5.8*sin(s*0.047+0.35)+2.47;
          float width = 16.8+3.45*sin(s*0.043+1.04)+2.75*sin(s*0.019+0.8);
          float bank = abs(p.x-center)-width;
          color = mix(color, vec3(0.16,0.145,0.075),smoothstep(-2.7,0.5,bank+breeze*0.9)*0.24);
          color += vec3(0.64,0.74,0.61)*foam;
          float air = 1.-exp(-pow(distanceToEye*mistDensity,2.));
          color = mix(color,mistColor*1.02,air*0.92);
          gl_FragColor = vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
    const plane = new THREE.PlaneGeometry(170, RIVER.sceneryEnd + 90).rotateX(-Math.PI / 2)
    this.surface = mesh(plane, material, 0, 0, -(RIVER.sceneryEnd - 76) / 2)
    this.surface.renderOrder = 5
    scene.add(this.surface)
    this.spray = makeSpray(scene)
  }

  resize(width, height) {
    const resolution = Math.min(width, VISUALS.reflectionSize)
    this.target.setSize(resolution, Math.max(1, Math.round(resolution * height / width)))
    this.frame = 0
  }

  reset() {
    for (const ripple of this.ripples) ripple.z = -100
    this.uniforms.rippleCount.value = 0
    for (const drop of this.spray.drops) drop.life = 0
  }

  ripple(x, z, strength, splash = false) {
    this.ripples[this.rippleIndex].set(x, z, this.time, strength)
    this.rippleIndex = (this.rippleIndex + 1) % RIPPLE_COUNT
    if (splash) this.spray.scatter(x, z, strength)
  }

  update(time, dt, boat, showWake) {
    this.time = time
    this.uniforms.riverTime.value = time
    let active = 0
    for (const ripple of this.ripples) {
      const age = Math.fround(Math.fround(time) - Math.fround(ripple.z))
      if (ripple.w && age < 2.701) this.uniforms.ripples.value[active++].copy(ripple)
    }
    this.uniforms.rippleCount.value = active
    this.uniforms.boatWake.value.set(boat.x, -boat.s, Math.sin(boat.yaw), -Math.cos(boat.yaw))
    this.uniforms.wakeSpeed.value = showWake ? Math.min(1, boat.speed / 3) : 0
    this.spray.update(dt)
  }

  reflect(renderer, scene, camera, boatModel, prepareVegetation) {
    this.frame++
    if (this.frame % 2 === 0) return
    camera.getWorldDirection(this.direction)
    const reflection = this.reflectedCamera
    reflection.fov = camera.fov
    reflection.aspect = camera.aspect
    reflection.near = camera.near
    reflection.far = camera.far
    reflection.position.set(camera.position.x, -camera.position.y, camera.position.z)
    reflection.up.set(0, -1, 0)
    reflection.lookAt(reflection.position.x + this.direction.x,
      reflection.position.y - this.direction.y, reflection.position.z + this.direction.z)
    reflection.updateProjectionMatrix()
    reflection.updateMatrixWorld()
    this.uniforms.mirrorProjection.value.multiplyMatrices(reflection.projectionMatrix, reflection.matrixWorldInverse)
    const wasVisible = boatModel.visible
    const sprayVisible = this.spray.object.visible
    this.surface.visible = false
    this.spray.object.visible = false
    boatModel.visible = false
    prepareVegetation(reflection, true)
    renderer.clippingPlanes = this.clip
    renderer.setRenderTarget(this.target)
    renderer.render(scene, reflection)
    renderer.setRenderTarget(null)
    renderer.clippingPlanes = []
    this.surface.visible = true
    this.spray.object.visible = sprayVisible
    boatModel.visible = wasVisible
  }
}

function makeSpray(scene) {
  const random = seededRandom(412)
  const count = 88
  const positions = new Float32Array(count * 3)
  const alpha = new Float32Array(count)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('opacity', new THREE.BufferAttribute(alpha, 1))
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `
      attribute float opacity;
      varying float vOpacity;
      void main() {
        vOpacity = opacity;
        vec4 view = modelViewMatrix * vec4(position,1.);
        gl_PointSize = clamp(17. / -view.z, 1., 5.);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      void main() {
        float falloff = 1.-smoothstep(0.13,0.5,length(gl_PointCoord-0.5));
        gl_FragColor = vec4(0.79,0.87,0.74,falloff*vOpacity);
      }
    `,
  })
  const object = new THREE.Points(geometry, material)
  object.frustumCulled = false
  object.visible = false
  scene.add(object)
  const drops = Array.from({ length: count }, () => ({ life: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 }))
  let cursor = 0
  return {
    object, drops,
    scatter(x, z, strength) {
      for (let i = 0; i < 13; i++) {
        const drop = drops[cursor++ % count]
        Object.assign(drop, {
          x, y: 0.03, z, life: 0.55,
          dx: (random() - 0.5) * 2.8, dy: (0.75 + random() * 1.7) * strength, dz: (random() - 0.5) * 2.5,
        })
      }
    },
    update(dt) {
      let active = false
      for (const [i, drop] of drops.entries()) {
        if (drop.life > 0) {
          drop.life -= dt
          drop.dy -= dt * 7
          drop.x += drop.dx * dt
          drop.y += drop.dy * dt
          drop.z += drop.dz * dt
          positions[i * 3] = drop.x
          positions[i * 3 + 1] = drop.y
          positions[i * 3 + 2] = drop.z
        }
        alpha[i] = drop.life > 0 && drop.y > 0 ? Math.min(0.85, drop.life * 2) : 0
        active ||= alpha[i] > 0
      }
      object.visible = active
      if (active) {
        geometry.attributes.position.needsUpdate = true
        geometry.attributes.opacity.needsUpdate = true
      }
    },
  }
}
