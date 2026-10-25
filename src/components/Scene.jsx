import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { HeartEngine } from '../heart/HeartEngine'
import { createRubyMaterial } from './rubyMaterial'

const MODEL_URL = `${import.meta.env.BASE_URL}models/eros.glb`

// 은은한 아이보리 그라데이션 배경 (유리가 비춰 보는 배경과 화면 배경을 동일하게)
function useBackdrop() {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = 4; c.height = 256
    const g = c.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#e9e4df')
    grad.addColorStop(0.6, '#f3efeb')
    grad.addColorStop(1, '#ece6e1')
    g.fillStyle = grad
    g.fillRect(0, 0, 4, 256)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    scene.background = tex
    return () => { scene.background = null; tex.dispose() }
  }, [scene])
}

function Eros({ levelRef, glowRef, hudRef }) {
  const { scene } = useGLTF(MODEL_URL)
  const engine = useMemo(() => new HeartEngine(), [])
  const material = useMemo(() => createRubyMaterial(), [])
  const group = useRef()

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

  useFrame((_, dt) => {
    const o = engine.update(dt, levelRef.current.value)
    if (group.current) group.current.scale.setScalar(1 + o.scale)
    material.userData.uInflate.value = o.inflate
    if (glowRef.current) glowRef.current.style.opacity = (0.0 + o.glow * 0.9).toFixed(3)
    if (hudRef.current) { hudRef.current.level = o.level; hudRef.current.active = o.active; hudRef.current.bpm = o.bpm }
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
    const dist = 6.3 * Math.max(1, 1.35 / aspect)
    const dir = new THREE.Vector3(-3.2, 1.25, -5.4).normalize()
    camera.position.copy(dir.multiplyScalar(dist))
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [size.width > size.height, camera]) // 가로/세로가 바뀔 때만 초기화 (사용자 확대 유지)
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

function Backdrop() { useBackdrop(); return null }

export default function Scene({ levelRef, glowRef, hudRef, phaseLive }) {
  const dpr = typeof window !== 'undefined' && window.innerWidth < 800 ? [1, 1.5] : [1, 2]
  return (
    <Canvas
      dpr={dpr}
      camera={{ fov: 30, near: 0.1, far: 60, position: [-3.2, 1.25, -5.4] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'none' }}
    >
      <Backdrop />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-3, 5, -4]} intensity={1.1} />
      <Suspense fallback={null}>
        <Eros levelRef={levelRef} glowRef={glowRef} hudRef={hudRef} />
        {/* 스튜디오 소프트박스: 외부 HDR 파일 없이 코드로 생성 (곡면을 따라 흐르는 하이라이트) */}
        <Environment resolution={512} frames={1}>
          <color attach="background" args={['#cdc6bf']} />
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
