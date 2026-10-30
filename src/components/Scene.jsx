import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { HeartEngine } from '../heart/HeartEngine'
import { createRubyMaterial, createBackDepthMaterial } from './rubyMaterial'

const MODEL_URL = `${import.meta.env.BASE_URL}models/eros.glb`

// 검은 배경 위의 유리가 "빛이 통과하는" 루비로 보이려면, 유리 뒤에 투과될 빛이 있어야 합니다.
// three.js의 투과(transmission)는 화면에 먼저 그려진 뒤쪽 장면을 굴절시키므로,
// 카메라 뒤쪽 멀리에 소프트박스 모양의 백라이트 카드를 두고 "투과 패스에서만" 그립니다.
// 최종 화면(메인 패스)에는 그려지지 않으므로 배경은 순수 #000000 그대로입니다.
function makeCardTexture() {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = '#050505'
  g.fillRect(0, 0, 512, 512)
  const glow = (x, y, rx, ry, a) => {
    g.save(); g.translate(x, y); g.scale(rx / ry, 1)
    const r = g.createRadialGradient(0, 0, 0, 0, 0, ry)
    r.addColorStop(0, `rgba(255,244,236,${a})`); r.addColorStop(0.55, `rgba(255,236,226,${a * 0.45})`); r.addColorStop(1, 'rgba(255,230,220,0)')
    g.fillStyle = r; g.beginPath(); g.arc(0, 0, ry, 0, Math.PI * 2); g.fill(); g.restore()
  }
  glow(262, 230, 250, 215, 1.0) // 중앙의 빛 (주변은 어둡게 남겨 명암 대비)
  glow(95, 120, 90, 170, 0.5) // 왼쪽 위 보조 빛
  glow(400, 400, 110, 110, 0.35) // 오른쪽 아래 작은 빛
  g.fillStyle = 'rgba(255,240,232,0.55)'; g.fillRect(430, 40, 26, 430) // 오른쪽 세로 스트립
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function BackLight({ fxRef }) {
  const mesh = useRef()
  useEffect(() => { fxRef.current.card = mesh.current }, [fxRef])
  const camera = useThree((st) => st.camera)
  const size = useThree((st) => st.size)
  const tex = useMemo(() => makeCardTexture(), [])
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, depthWrite: false })
    m.color.setRGB(1.2, 1.2, 1.2) // 선형 HDR 밝기 (투과 버퍼는 half-float)
    return m
  }, [tex])
  const fwd = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => { if (new URLSearchParams(location.search).has('dev') || new URLSearchParams(location.search).has('test')) window.__card = mat }, [mat])
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const f = fxRef.current
    const k = 1.2 * (1 + 0.12 * f.bpmN + 0.22 * f.climax * f.beat)
    mat.color.setRGB(k, k, k)
    const D = 20
    camera.getWorldDirection(fwd)
    m.position.copy(camera.position).addScaledVector(fwd, D)
    m.quaternion.copy(camera.quaternion)
    const h = 2 * D * Math.tan((camera.fov * Math.PI) / 360) * 1.25
    m.scale.set(h * (size.width / size.height), h, 1)
  })
  return (
    <mesh
      ref={mesh}
      frustumCulled={false}
      renderOrder={-10}
      onBeforeRender={(renderer) => { mat.colorWrite = renderer.getRenderTarget() !== null }}
    >
      <planeGeometry args={[1, 1]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}

function Eros({ bpmRef, settingsRef, glowRef, hudRef, fxRef }) {
  const { scene } = useGLTF(MODEL_URL)
  const { gl } = useThree()
  const engine = useMemo(() => new HeartEngine(), [])
  const material = useMemo(() => createRubyMaterial(), [])
  const group = useRef()
  const backMat = useMemo(() => createBackDepthMaterial(material.userData.uInflate), [material])
  const backRT = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true })
    return rt
  }, [])
  const tmpSize = useMemo(() => new THREE.Vector2(), [])
  useEffect(() => () => { backRT.dispose(); backMat.dispose() }, [backRT, backMat])

  const { mesh, center, pivot } = useMemo(() => {
    let mesh
    scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o })
    mesh.geometry.computeBoundingBox()
    const bb = mesh.geometry.boundingBox
    const center = bb.getCenter(new THREE.Vector3())
    // 박동의 중심: 심장 모티프 몸통 부근 (Blender 좌표 (0.55, 0, 0.1) -> glTF (0.55, 0.1, 0))
    const pivot = new THREE.Vector3(0.5, 0.05, 0)
    return { mesh, center, pivot }
  }, [scene])

  useEffect(() => {
    if (new URLSearchParams(location.search).has('dev') || new URLSearchParams(location.search).has('test')) window.__ruby = material
    mesh.material = material
    mesh.frustumCulled = false
    return () => material.dispose()
  }, [mesh, material])

  useFrame(({ scene: sc, camera }, dt) => {
    const bpm = bpmRef.current.bpm
    const o = engine.update(dt, bpm, settingsRef.current.strength ?? 1)
    if (typeof window.__forcePulse === 'number') { // 개발용: 특정 변형량을 고정해 형태 확인
      const p = window.__forcePulse
      o.scale = p * 0.8; o.inflate = p * 0.2 * 0.35; o.glow = Math.min(1, Math.max(0, p / 0.165))
    }
    if (group.current) group.current.scale.setScalar(1 + o.scale)
    material.userData.uInflate.value = o.inflate
    // BPM이 높을수록 전체 빛이 조금씩 밝아지고, 145 이상에서는 박동마다 빛이 살짝 출렁임
    const climax = Math.min(1, Math.max(0, (bpm - 120) / 40))
    const fx = fxRef.current
    fx.beat = o.beat; fx.bpmN = o.bpmN; fx.climax = climax
    material.envMapIntensity = 1.25 + 0.25 * o.bpmN + 0.35 * climax * o.beat
    if (glowRef.current) glowRef.current.style.opacity = Math.min(1, 0.18 + 0.35 * o.bpmN + o.glow * (0.45 + 0.4 * o.bpmN)).toFixed(3)
    const h = hudRef.current
    h.pulse = o.pulse; h.scale = o.scale; h.bpm = bpm

    // 뒷면 깊이 패스 (시선별 유리 두께 계산용). 박동으로 변형된 현재 형태 그대로 기록
    gl.getDrawingBufferSize(tmpSize)
    const k = 1
    const bw = Math.max(2, Math.round(tmpSize.x * k)), bh = Math.max(2, Math.round(tmpSize.y * k))
    if (backRT.width !== bw || backRT.height !== bh) backRT.setSize(bw, bh)
    material.userData.uMain.value.copy(tmpSize)
    const card = fxRef.current.card
    const prevRT = gl.getRenderTarget()
    const prevBg = sc.background
    mesh.material = backMat
    if (card) card.visible = false
    sc.background = null
    gl.setRenderTarget(backRT)
    gl.clear()
    gl.render(sc, camera)
    gl.setRenderTarget(prevRT)
    sc.background = prevBg
    if (card) card.visible = true
    mesh.material = material
    material.userData.uBack.value = backRT.texture
  })

  return (
    <group position={center.clone().negate()}>
      <group position={pivot}>
        <group ref={group}>
          <primitive object={scene} position={pivot.clone().negate()} />
        </group>
      </group>
    </group>
  )
}

function Rig({ phaseLive }) {
  const controls = useRef()
  const last = useRef(0)
  const { camera, size } = useThree()
  // 화면 비율(모바일 세로)에 맞춰 처음 거리를 자동 조정
  useEffect(() => {
    const aspect = size.width / size.height
    const dist = 6.9 * Math.max(1, 1.3 / aspect)
    const dir = new THREE.Vector3(-3.2, 1.25, -5.4).normalize()
    camera.position.copy(dir.multiplyScalar(dist))
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [size.width > size.height, camera]) // 가로/세로가 바뀔 때만 초기화 (사용자 확대 유지)
  // 오른쪽의 BPM 숫자·게이지와 겹치지 않도록 3D 장면을 왼쪽으로 살짝 옮김 (화면 오프셋만 변경, 모델은 그대로)
  useEffect(() => {
    const w = size.width, h = size.height
    const narrow = w < 700
    const shift = narrow ? Math.min(40, w * 0.09) : Math.min(w * 0.1, 150)
    camera.setViewOffset(w, h, shift, narrow ? -4 : -h * 0.03, w, h) // y: 장면을 살짝 위로 (문구와 겹침 방지)
    camera.updateProjectionMatrix()
    return () => { camera.clearViewOffset(); camera.updateProjectionMatrix() }
  }, [size.width, size.height, camera])
  useFrame(() => {
    if (!controls.current) return
    const idle = performance.now() - last.current > 5000
    controls.current.autoRotate = idle && !phaseLive
  })
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.7}
      zoomSpeed={0.7}
      minDistance={2.6}
      maxDistance={11}
      autoRotateSpeed={0.55}
      onStart={() => { last.current = performance.now() }}
      onChange={() => { last.current = performance.now() }}
    />
  )
}

export default function Scene({ bpmRef, settingsRef, glowRef, hudRef, phaseLive }) {
  const fxRef = useRef({ beat: 0, bpmN: 0, climax: 0 })
  const dpr = typeof window !== 'undefined' && window.innerWidth < 800 ? [1, 1.5] : [1, 2]
  return (
    <Canvas
      dpr={dpr}
      camera={{ fov: 30, near: 0.1, far: 60, position: [-3.2, 1.25, -5.4] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { if ('transmissionResolutionScale' in gl) gl.transmissionResolutionScale = window.innerWidth < 800 ? 0.75 : 1 }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={['#000000']} />
      <BackLight fxRef={fxRef} />
      <Suspense fallback={null}>
        <Eros bpmRef={bpmRef} settingsRef={settingsRef} glowRef={glowRef} hudRef={hudRef} fxRef={fxRef} />
        {/* 스튜디오 소프트박스: 외부 HDR 파일 없이 코드로 생성 (곡면을 따라 흐르는 하이라이트) */}
        <Environment resolution={512} frames={1}>
          <color attach="background" args={['#000000']} />
          <Lightformer form="rect" intensity={7} position={[-5, 3.5, -4]} scale={[6, 4, 1]} />
          <Lightformer form="rect" intensity={5} position={[4.5, 2.5, -5]} scale={[1.2, 6, 1]} />
          <Lightformer form="rect" intensity={5} position={[-5, 0.5, 4]} scale={[1, 6, 1]} />
          <Lightformer form="rect" intensity={4} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
          <Lightformer form="rect" intensity={3} position={[5, -1, 4]} scale={[4, 3, 1]} />
          <Lightformer form="ring" intensity={2.5} position={[0, -4, 0]} rotation-x={-Math.PI / 2} scale={5} />
        </Environment>
      </Suspense>
      <Rig phaseLive={phaseLive} />
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)
