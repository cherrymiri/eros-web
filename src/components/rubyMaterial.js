import * as THREE from 'three'

// Blender의 Volume Absorption 재질을 웹에서 근사한 투명 루비 크리스털 재질.
// - transmission/ior/attenuation: three.js 표준 물리 재질
// - onBeforeCompile: (1) 박동용 표면 팽창(vertex) (2) 위치별 두께 보정(fragment)
//   Blender는 실제 두께로 흡수를 계산하지만 웹은 두께 값이 하나라서, 몸통은 두껍게/호른은 얇게 위치로 보정합니다.
// Blender의 Volume Absorption(색 (0.93,0.008,0.012), 밀도 20) → 단위 길이당 흡수계수 σ = (1-색)·밀도
//   σ = (1.4, 19.8, 19.8)/단위. three.js의 attenuation은 같은 Beer-Lambert 식이라 그대로 옮길 수 있습니다.
//   (거리 D에서의 투과율 = exp(-σ·D))
const SIGMA = [1.4, 19.8, 19.8]
const ATT_DIST = 0.1
export const ATT_COLOR = SIGMA.map((v) => Math.exp(-v * ATT_DIST))

// 뒷면 깊이 패스: 모델의 뒷면(BackSide)만 그려 "카메라에서 뒷면까지의 거리"를 기록합니다.
// 앞면 깊이와의 차이 = 그 시선이 유리 속을 지나는 실제 길이 → 얇은 호른 벽은 연하게, 두꺼운 몸통은 진하게.
export function createBackDepthMaterial(inflate) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uInflate: inflate },
    vertexShader: `
      uniform float uInflate; varying float vD;
      void main(){
        float wBack = mix(0.45, 1.0, smoothstep(-0.2, 0.5, position.x));
        vec3 p = position + normal * uInflate * wBack;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vD; void main(){ gl_FragColor = vec4(vD, 0.0, 0.0, 1.0); }`,
  })
}

// Blender의 Volume Absorption 재질을 웹에서 근사한 투명 루비 크리스털 재질.
// - transmission/ior/attenuation: three.js 표준 물리 재질 (Blender와 같은 흡수 계수)
// - onBeforeCompile: (1) 박동용 표면 팽창(vertex) (2) 뒷면 깊이 텍스처로 계산한 '시선별 실제 두께'(fragment)
export function createRubyMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffd9d9'),
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    ior: 1.52,
    thickness: 0.05,
    attenuationColor: new THREE.Color().setRGB(ATT_COLOR[0], ATT_COLOR[1], ATT_COLOR[2]),
    attenuationDistance: ATT_DIST,
    clearcoat: 0.25,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.3,
    specularIntensity: 1,
    side: THREE.DoubleSide, // 뒷면도 투과 패스에 그려져 반대편 곡면이 비쳐 보임
  })
  m.userData.uInflate = { value: 0 }
  m.userData.uBack = { value: null }
  m.userData.uMain = { value: new THREE.Vector2(1, 1) }
  m.userData.uThickScale = { value: 0.4 }
  m.userData.uThickMin = { value: 0.004 }
  m.userData.uThickFallback = { value: 0.05 }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uInflate = m.userData.uInflate
    shader.uniforms.uBack = m.userData.uBack
    shader.uniforms.uMain = m.userData.uMain
    shader.uniforms.uThickScale = m.userData.uThickScale
    shader.uniforms.uThickMin = m.userData.uThickMin
    shader.uniforms.uThickFallback = m.userData.uThickFallback
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uInflate;')
      .replace(
        '#include <begin_vertex>',
        `float wBack = mix(0.45, 1.0, smoothstep(-0.2, 0.5, position.x));
         vec3 transformed = position + normal * uInflate * wBack;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uBack; uniform vec2 uMain; uniform float uThickScale; uniform float uThickMin; uniform float uThickFallback;')
      .replace(
        '#include <transmission_fragment>',
        // three.js가 이 청크 안에서 material.thickness를 상수로 덮어쓰므로, 그 줄 자체를 '시선별 실제 두께'로 교체
        THREE.ShaderChunk.transmission_fragment.replace(
          'material.thickness = thickness;',
          `{
            float backD = texture2D(uBack, gl_FragCoord.xy / uMain).r;
            float vz = max(abs(normalize(vViewPosition).z), 0.25);
            float path = backD > 0.0 ? max(backD - vViewPosition.z, 0.0) / vz : uThickFallback;
            material.thickness = gl_FrontFacing ? clamp(path, uThickMin, 1.5) * uThickScale : uThickMin;
          }`,
        ),
      )
  }
  m.customProgramCacheKey = () => 'eros-ruby-v6'
  return m
}
