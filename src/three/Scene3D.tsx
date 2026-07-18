import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useStore } from '../model/store'
import { buildProject, disposePlan, type BuiltProject } from './buildScene'
import { rotatePt, snapTo } from '../model/geometry'

interface ThreeState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  built: BuiltProject | null
  selectionBox: THREE.BoxHelper | null
  sun: THREE.DirectionalLight
  raf: number
}

export default function Scene3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ThreeState | null>(null)
  const floorCount = useStore((s) =>
    Math.max(1, ...s.project.buildings.map((b) => b.floors.length))
  )
  const [visFloor, setVisFloor] = useState<'all' | number>('all')
  const visRef = useRef(visFloor)
  visRef.current = visFloor

  // apply floor visibility to the built groups
  const applyVisibility = () => {
    const st = stateRef.current
    if (!st?.built) return
    for (const fg of st.built.floorGroups) {
      fg.group.visible = visRef.current === 'all' || visRef.current === fg.floor
    }
  }
  useEffect(applyVisibility, [visFloor])

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

    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 2, 20000)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = THREE.MathUtils.degToRad(85)
    controls.minDistance = 40
    controls.maxDistance = 6000

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
      controls.target.copy(center).setY(Math.max(20, center.y * 0.8))
      controls.update()
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
        const info = st.built.furniture.get(sel.id)
        if (info) {
          st.selectionBox = new THREE.BoxHelper(info.group, 0x2563eb)
          scene.add(st.selectionBox)
        }
      }
    }

    const rebuild = (fit: boolean) => {
      const project = useStore.getState().project
      if (st.built) {
        scene.remove(st.built.group)
        disposePlan(st.built.group)
      }
      clearSelectionBox()
      st.built = buildProject(project)
      scene.add(st.built.group)
      applyVisibility()
      const { center, radius } = st.built
      sun.position.set(center.x + radius * 1.1, center.y + radius * 2.2, center.z + radius * 0.7)
      sun.target.position.copy(center)
      sun.target.updateMatrixWorld()
      const cam = sun.shadow.camera as THREE.OrthographicCamera
      const r = radius * 1.8
      cam.left = -r
      cam.right = r
      cam.top = r
      cam.bottom = -r
      cam.far = radius * 8
      cam.updateProjectionMatrix()
      if (fit) fitCamera(center, radius)
      syncSelectionBox()
    }

    rebuild(true)

    let timer: ReturnType<typeof setTimeout> | undefined
    let lastProject = useStore.getState().project
    let lastSel = useStore.getState().selection
    const unsub = useStore.subscribe((s) => {
      if (s.project !== lastProject) {
        lastProject = s.project
        clearTimeout(timer)
        timer = setTimeout(() => rebuild(false), 140)
      }
      if (s.selection !== lastSel) {
        lastSel = s.selection
        syncSelectionBox()
      }
    })

    // picking + drag-move on the furniture's own floor plane
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    let dragging: { id: string; grabOffset: THREE.Vector3; moved: boolean } | null = null

    const setNdc = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      )
    }

    const pick = (ev: PointerEvent): string | null => {
      if (!st.built) return null
      setNdc(ev)
      ray.setFromCamera(ndc, camera)
      const groups: THREE.Object3D[] = []
      for (const info of st.built.furniture.values()) {
        const vis =
          info.place.scope === 'site' ||
          visRef.current === 'all' ||
          visRef.current === info.place.floor
        if (vis) groups.push(info.group)
      }
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
      setNdc(ev)
      ray.setFromCamera(ndc, camera)
      const out = new THREE.Vector3()
      return ray.ray.intersectPlane(dragPlane, out) ? out : null
    }

    /** world plan point -> furniture-local coords (building rotation aware) */
    const toLocalPos = (info: { transform?: { x: number; y: number; rot: number } }, wx: number, wz: number) => {
      if (!info.transform) return { x: wx, y: wz }
      const p = rotatePt({ x: wx - info.transform.x, y: wz - info.transform.y }, -info.transform.rot)
      return { x: p.x, y: p.y }
    }

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return
      const id = pick(ev)
      const store = useStore.getState()
      if (id && st.built) {
        const info = st.built.furniture.get(id)!
        // route edits (panel + drag writes) to this furniture's layer
        if (info.place.scope === 'building') {
          store.enterBuilding(info.place.index)
          store.setActiveFloor(info.place.floor)
        } else {
          store.exitToPlot()
        }
        store.select({ kind: 'furniture', id })
        dragPlane.constant = -(info.elevation + 0.12)
        const p = planePoint(ev)
        if (p) {
          const local = toLocalPos(info, p.x, p.z)
          dragging = {
            id,
            grabOffset: new THREE.Vector3(
              info.group.position.x - local.x,
              0,
              info.group.position.z - local.y
            ),
            moved: false,
          }
          controls.enabled = false
        }
      } else {
        store.select(null)
      }
    }
    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging || !st.built) return
      const p = planePoint(ev)
      if (!p) return
      const info = st.built.furniture.get(dragging.id)
      if (!info) return
      if (!dragging.moved) {
        dragging.moved = true
        useStore.getState().checkpoint()
      }
      const local = toLocalPos(info, p.x, p.z)
      info.group.position.set(
        local.x + dragging.grabOffset.x,
        info.group.position.y,
        local.y + dragging.grabOffset.z
      )
      st.selectionBox?.update()
    }
    const onPointerUp = () => {
      if (dragging && st.built) {
        const info = st.built.furniture.get(dragging.id)
        if (info && dragging.moved) {
          useStore.getState().updateFurniture(dragging.id, {
            x: snapTo(info.group.position.x, 1),
            y: snapTo(info.group.position.z, 1),
          })
        }
        dragging = null
        controls.enabled = true
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    const loop = () => {
      st.raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="scene3d-wrap">
      <div ref={mountRef} className="scene3d-mount" />
      {floorCount > 1 && (
        <div className="floor-vis" role="toolbar" aria-label="Floor visibility">
          <button className={visFloor === 'all' ? 'active' : ''} onClick={() => setVisFloor('all')}>
            All
          </button>
          {Array.from({ length: floorCount }, (_, i) => (
            <button key={i} className={visFloor === i ? 'active' : ''} onClick={() => setVisFloor(i)}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
      <div className="canvas-hint scene3d-hint">
        Drag to orbit · scroll to zoom · click items to select, drag to move · edits in 2D
        regenerate this view automatically
      </div>
      <div className="zoom-controls">
        <button title="Recenter view" onClick={() => (mountRef.current as any)?.__recenter?.()}>
          ⌂
        </button>
      </div>
    </div>
  )
}
