import * as THREE from 'three'

// Blender의 Volume Absorption 재질을 웹에서 근사한 투명 루비 크리스털 재질.
// - transmission/ior/attenuation: three.js 표준 물리 재질
// - onBeforeCompile: (1) 박동용 표면 팽창(vertex) (2) 위치별 두께 보정(fragment)
//   Blender는 실제 두께로 흡수를 계산하지만 웹은 두께 값이 하나라서, 몸통은 두껍게/호른은 얇게 위치로 보정합니다.
export function createRubyMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffe0e0'),
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    ior: 1.52,
    thickness: 0.1,
    attenuationColor: new THREE.Color().setRGB(0.9, 0.03, 0.05),
    attenuationDistance: 0.12,
    clearcoat: 0.2,
    clearcoatRoughness: 0,
    envMapIntensity: 1.25,
    specularIntensity: 1,
    side: THREE.DoubleSide, // 뒷면도 투과 패스에 그려져 반대편 곡면이 비쳐 보임
  })
  m.userData.uInflate = { value: 0 }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uInflate = m.userData.uInflate
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uInflate;\nvarying vec3 vObjPos;')
      .replace(
        '#include <begin_vertex>',
        `float wBack = mix(0.45, 1.0, smoothstep(-0.2, 0.5, position.x));
         vec3 transformed = position + normal * uInflate * wBack;
         vObjPos = position;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_TRANSMISSION
          float tx = mix(0.35, 2.0, smoothstep(0.0, 0.55, vObjPos.x));
          float ty = mix(0.4, 1.0, smoothstep(-0.34, -0.14, vObjPos.y));
          material.thickness *= tx * ty;
        #endif`,
      )
  }
  m.customProgramCacheKey = () => 'eros-ruby-v2'
  return m
}
