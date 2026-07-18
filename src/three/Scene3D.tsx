import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useStore } from '../model/store'
import { buildPlan, disposePlan, type BuiltPlan } from './buildScene'
import { snapTo } from '../model/geometry'

interface ThreeState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  built: BuiltPlan | null
  selectionBox: THREE.BoxHelper | null
  sun: THREE.DirectionalLight
  raf: number
}

export default function Scene3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ThreeState | null>(null)

  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.02
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#eceef1')

    const camera = new THREE.PerspectiveCamera(
      38,
      mount.clientWidth / mount.clientHeight,
      2,
      20000
    )

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = THREE.MathUtils.degToRad(85)
    controls.minDistance = 40
    controls.maxDistance = 6000

    // lights
    const hemi = new THREE.HemisphereLight('#ffffff', '#d6d8dd', 1.05)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight('#fff3e2', 1.9)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 2
    scene.add(sun)
    const fill = new THREE.DirectionalLight('#e6edff', 0.75)
    fill.position.set(-600, 500, 500)
    scene.add(fill)

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40000, 40000),
      new THREE.MeshStandardMaterial({ color: '#e6e7ea', roughness: 0.96 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -4.2
    ground.receiveShadow = true
    scene.add(ground)

    const st: ThreeState = {
      renderer,
      scene,
      camera,
      controls,
      built: null,
      selectionBox: null,
      sun,
      raf: 0,
    }
    stateRef.current = st

    const fitCamera = (center: THREE.Vector3, radius: number) => {
      const distance = Math.max(radius * 2.6, 200)
      const az = THREE.MathUtils.degToRad(62)
      const el = THREE.MathUtils.degToRad(38)
      camera.position.set(
        center.x + distance * Math.cos(el) * Math.cos(az),
        center.y + distance * Math.sin(el),
        center.z + distance * Math.cos(el) * Math.sin(az)
      )
      controls.target.copy(center).setY(20)
      controls.update()
    }

    const rebuild = (fit: boolean) => {
      const plan = useStore.getState().plan
      if (st.built) {
        scene.remove(st.built.group)
        disposePlan(st.built.group)
      }
      clearSelectionBox()
      st.built = buildPlan(plan)
      scene.add(st.built.group)
      // aim the sun and shadow camera at the plan
      const { center, radius } = st.built
      sun.position.set(center.x + radius * 1.1, radius * 2.2, center.z + radius * 0.7)
      sun.target.position.copy(center)
      sun.target.updateMatrixWorld()
      const cam = sun.shadow.camera as THREE.OrthographicCamera
      const r = radius * 1.6
      cam.left = -r
      cam.right = r
      cam.top = r
      cam.bottom = -r
      cam.far = radius * 8
      cam.updateProjectionMatrix()
      if (fit) fitCamera(center, radius)
      syncSelectionBox()
    }

    const clearSelectionBox = () => {
      if (st.selectionBox) {
        scene.remove(st.selectionBox)
        st.selectionBox.dispose()
        st.selectionBox = null
      }
    }

    const syncSelectionBox = () => {
      clearSelectionBox()
      const sel = useStore.getState().selection
      if (sel?.kind === 'furniture' && st.built) {
        const g = st.built.furniture.get(sel.id)
        if (g) {
          st.selectionBox = new THREE.BoxHelper(g, 0x2563eb)
          scene.add(st.selectionBox)
        }
      }
    }

    rebuild(true)

    // rebuild on plan changes (debounced), selection box on selection changes
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastPlan = useStore.getState().plan
    let lastSel = useStore.getState().selection
    const unsub = useStore.subscribe((s) => {
      if (s.plan !== lastPlan) {
        lastPlan = s.plan
        clearTimeout(timer)
        timer = setTimeout(() => rebuild(false), 140)
      }
      if (s.selection !== lastSel) {
        lastSel = s.selection
        syncSelectionBox()
      }
    })

    // picking + drag-move on the floor plane
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    let dragging: { id: string; grabOffset: THREE.Vector3; moved: boolean } | null = null

    const pick = (ev: PointerEvent): string | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      )
      ray.setFromCamera(ndc, camera)
      if (!st.built) return null
      const groups = [...st.built.furniture.values()]
      const hits = ray.intersectObjects(groups, true)
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object
        while (obj) {
          if (obj.userData.furnId) return obj.userData.furnId as string
          obj = obj.parent
        }
      }
      return null
    }

    const planePoint = (ev: PointerEvent): THREE.Vector3 | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      )
      ray.setFromCamera(ndc, camera)
      const out = new THREE.Vector3()
      return ray.ray.intersectPlane(floorPlane, out) ? out : null
    }

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return
      const id = pick(ev)
      const store = useStore.getState()
      if (id) {
        store.select({ kind: 'furniture', id })
        const g = st.built!.furniture.get(id)!
        const p = planePoint(ev)
        if (p) {
          dragging = {
            id,
            grabOffset: new THREE.Vector3().subVectors(g.position, p),
            moved: false,
          }
          controls.enabled = false
        }
      } else {
        store.select(null)
      }
    }
    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging) return
      const p = planePoint(ev)
      if (!p) return
      const g = st.built?.furniture.get(dragging.id)
      if (!g) return
      if (!dragging.moved) {
        dragging.moved = true
        useStore.getState().checkpoint()
      }
      g.position.set(p.x + dragging.grabOffset.x, g.position.y, p.z + dragging.grabOffset.z)
      st.selectionBox?.update()
    }
    const onPointerUp = () => {
      if (dragging) {
        const g = st.built?.furniture.get(dragging.id)
        if (g && dragging.moved) {
          useStore
            .getState()
            .updateFurniture(dragging.id, { x: snapTo(g.position.x, 1), y: snapTo(g.position.z, 1) })
        }
        dragging = null
        controls.enabled = true
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    // resize
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    // render loop
    const loop = () => {
      st.raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    // expose recenter for the overlay button
    ;(mount as any).__recenter = () => {
      if (st.built) fitCamera(st.built.center, st.built.radius)
    }

    return () => {
      cancelAnimationFrame(st.raf)
      unsub()
      clearTimeout(timer)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (st.built) disposePlan(st.built.group)
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      stateRef.current = null
    }
  }, [])

  return (
    <div className="scene3d-wrap">
      <div ref={mountRef} className="scene3d-mount" />
      <div className="canvas-hint scene3d-hint">
        Drag to orbit · scroll to zoom · click furniture to select, drag to move · edits in 2D
        regenerate this view automatically
      </div>
      <div className="zoom-controls">
        <button
          title="Recenter view"
          onClick={() => (mountRef.current as any)?.__recenter?.()}
        >
          ⌂
        </button>
      </div>
    </div>
  )
}
