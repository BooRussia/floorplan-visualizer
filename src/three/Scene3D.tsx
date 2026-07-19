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
  frameVisible?: () => void
  rebuild?: (fit: boolean) => void
}

export default function Scene3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ThreeState | null>(null)
  // capture what to show: the building being edited, or the whole plot
  const focusRef = useRef(useStore.getState().mode)
  const focus = focusRef.current
  const floorCount = useStore((s) =>
    focus.scope === 'building'
      ? s.project.buildings[focus.index]?.floors.length ?? 1
      : Math.max(1, ...s.project.buildings.map((b) => b.floors.length))
  )
  const roof = useStore((s) =>
    focus.scope === 'building' ? s.project.buildings[focus.index]?.roof : undefined
  )
  const [closed, setClosed] = useState(false)
  const closedRef = useRef(closed)
  closedRef.current = closed
  const [winMode, setWinMode] = useState(false)
  const winModeRef = useRef(winMode)
  winModeRef.current = winMode

  // Multi-story buildings default to showing ONLY the top floor (lower floors
  // hidden) so you see it as a clean single-story plan; 'all' stacks them.
  const topFloor = Math.max(0, floorCount - 1)
  const [visFloor, setVisFloor] = useState<'all' | number>(
    focus.scope === 'building' && floorCount > 1 ? topFloor : 'all'
  )
  const visRef = useRef(visFloor)
  visRef.current = visFloor

  // apply floor visibility: 'all' stacks floors at their real elevation; a single
  // floor is isolated AND dropped to ground level so it doesn't float, then reframed.
  const applyVisibility = (reframe = true) => {
    const st = stateRef.current
    if (!st?.built) return
    const sel = closedRef.current ? 'all' : visRef.current
    for (const fg of st.built.floorGroups) {
      if (sel === 'all') {
        fg.group.visible = true
        fg.group.position.y = fg.baseY
      } else {
        fg.group.visible = fg.floor === sel
        fg.group.position.y = fg.floor === sel ? 0 : fg.baseY
      }
    }
    st.selectionBox?.update()
    if (reframe && st.frameVisible) st.frameVisible()
  }
  useEffect(() => applyVisibility(true), [visFloor])

  // closed exterior <-> open dollhouse: rebuild with/without roof + full shell
  useEffect(() => {
    const st = stateRef.current
    if (st?.rebuild) st.rebuild(true)
  }, [closed, roof?.style, roof?.pitch, roof?.material])

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
    scene.background = new THREE.Color(
      useStore.getState().theme === 'dark' ? '#1a1c20' : '#eceef1'
    )

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

    const groundMat = new THREE.MeshStandardMaterial({
      color: useStore.getState().theme === 'dark' ? '#22242a' : '#e6e7ea',
      roughness: 0.96,
    })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), groundMat)
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

    // steeper angle for taller (multi-story) buildings so you can see down into
    // the open dollhouse floors instead of the top floor's walls hiding its floor
    const focusFloors =
      focus.scope === 'building'
        ? useStore.getState().project.buildings[focus.index]?.floors.length ?? 1
        : 1
    const elevationDeg = focus.scope === 'building' ? Math.min(56, 30 + focusFloors * 8) : 38

    const fitCamera = (center: THREE.Vector3, radius: number) => {
      const distance = Math.max(radius * 2.9, 200)
      const az = THREE.MathUtils.degToRad(62)
      const el = THREE.MathUtils.degToRad(elevationDeg)
      camera.position.set(
        center.x + distance * Math.cos(el) * Math.cos(az),
        center.y + distance * Math.sin(el),
        center.z + distance * Math.cos(el) * Math.sin(az)
      )
      controls.target.copy(center).setY(Math.max(20, center.y * 0.6))
      controls.update()
    }

    // Frame whatever floor groups are currently visible (respects isolate + ground).
    const frameVisible = () => {
      if (!st.built) return
      if (focus.scope !== 'building') {
        fitCamera(st.built.center, st.built.radius)
        return
      }
      st.built.group.updateMatrixWorld(true)
      const box = new THREE.Box3()
      let any = false
      for (const fg of st.built.floorGroups) {
        if (!fg.group.visible) continue
        box.expandByObject(fg.group)
        any = true
      }
      if (!any || box.isEmpty()) {
        fitCamera(st.built.center, st.built.radius)
        return
      }
      const center = new THREE.Vector3()
      const size = new THREE.Vector3()
      box.getCenter(center)
      box.getSize(size)
      const radius = Math.max(size.x, size.z, size.y * 1.1, 120) / 2
      fitCamera(center, radius)
    }
    st.frameVisible = frameVisible

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
      st.built = buildProject(project, focus, closedRef.current)
      scene.add(st.built.group)
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
      applyVisibility(fit)
      syncSelectionBox()
    }

    st.rebuild = rebuild
    rebuild(true)

    let timer: ReturnType<typeof setTimeout> | undefined
    let lastProject = useStore.getState().project
    let lastSel = useStore.getState().selection
    let lastTheme = useStore.getState().theme
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
      if (s.theme !== lastTheme) {
        lastTheme = s.theme
        ;(scene.background as THREE.Color).set(s.theme === 'dark' ? '#1a1c20' : '#eceef1')
        groundMat.color.set(s.theme === 'dark' ? '#22242a' : '#e6e7ea')
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
        // in plot view buildings are enclosed — only site items are pickable
        if (focus.scope === 'plot' && info.place.scope === 'building') continue
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

    /** pick a wall face (window-placement mode): returns wallId + floor + hit point */
    const pickWall = (ev: PointerEvent) => {
      if (!st.built) return null
      setNdc(ev)
      ray.setFromCamera(ndc, camera)
      const hits = ray.intersectObjects([st.built.group], true)
      for (const hit of hits) {
        const tag = hit.object.userData.wallTag as { wallId: string; floor: number } | undefined
        if (!tag) continue
        // ignore walls on hidden floors
        let p: THREE.Object3D | null = hit.object
        let visible = true
        while (p) {
          if (p.visible === false) {
            visible = false
            break
          }
          p = p.parent
        }
        if (!visible) continue
        return { tag, point: hit.point.clone() }
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
      const store = useStore.getState()

      // window-placement mode: click a wall to add a window there
      if (winModeRef.current && focus.scope === 'building') {
        const hit = pickWall(ev)
        if (hit) {
          const b = store.project.buildings[focus.index]
          const floor = b.floors[hit.tag.floor]
          const wall = floor?.walls.find((w) => w.id === hit.tag.wallId)
          if (wall && !wall.bulge) {
            // focused building is built at origin/rot 0, so world x/z are local plan coords
            const ax = wall.a.x
            const ay = wall.a.y
            const dx = wall.b.x - ax
            const dy = wall.b.y - ay
            const len2 = dx * dx + dy * dy || 1
            const L = Math.sqrt(len2)
            const width = 36
            let t = ((hit.point.x - ax) * dx + (hit.point.z - ay) * dy) / len2
            const margin = width / 2 / L
            t = Math.max(margin, Math.min(1 - margin, t))
            if (L >= width + 6) {
              store.setActiveFloor(hit.tag.floor)
              store.checkpoint()
              store.addOpening({
                wallId: wall.id,
                t,
                width,
                type: 'window',
                flipSwing: false,
                flipHinge: false,
              })
            }
          }
        }
        return
      }

      // closed exterior: interior furniture isn't clickable
      if (closedRef.current && focus.scope === 'building') {
        store.select(null)
        return
      }

      const id = pick(ev)
      if (id && st.built) {
        const info = st.built.furniture.get(id)!
        // route edits to this furniture's floor (focus already set the layer at mount)
        if (info.place.scope === 'building') store.setActiveFloor(info.place.floor)
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWinMode(false)
    }
    window.addEventListener('keydown', onKey)

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
      st.frameVisible?.()
    }

    return () => {
      cancelAnimationFrame(st.raf)
      unsub()
      clearTimeout(timer)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKey)
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
      {floorCount > 1 && !closed && (
        <div className="floor-vis" role="toolbar" aria-label="Floor visibility">
          {Array.from({ length: floorCount }, (_, i) => floorCount - 1 - i).map((i) => (
            <button
              key={i}
              className={visFloor === i ? 'active' : ''}
              onClick={() => setVisFloor(i)}
              title={`Show floor ${i + 1} only`}
            >
              Floor {i + 1}
            </button>
          ))}
          <button
            className={visFloor === 'all' ? 'active' : ''}
            onClick={() => setVisFloor('all')}
            title="Stack all floors"
          >
            All
          </button>
        </div>
      )}
      {focus.scope === 'building' && (
        <div className="scene3d-controls">
          <button
            className={closed ? 'active' : ''}
            onClick={() => setClosed(!closed)}
            title={closed ? 'Back to the open cutaway dollhouse' : 'Show the finished exterior with roof'}
          >
            {closed ? '⌂ Closed' : '◱ Open'}
          </button>
          <button
            className={winMode ? 'active' : ''}
            onClick={() => setWinMode(!winMode)}
            title="Click a wall to add a window (Esc to finish)"
          >
            + Window
          </button>
          {closed && roof && (
            <>
              <select
                value={roof.style}
                title="Roof style"
                onChange={(e) => {
                  const st = useStore.getState()
                  const b = st.project.buildings[focus.index]
                  st.checkpoint()
                  st.updateBuilding(b.id, { roof: { ...b.roof, style: e.target.value as any } })
                }}
              >
                <option value="gable">Gable</option>
                <option value="hip">Hip</option>
                <option value="flat">Flat</option>
              </select>
              {roof.style !== 'flat' && (
                <select
                  value={String(roof.pitch)}
                  title="Roof pitch (rise : 12)"
                  onChange={(e) => {
                    const st = useStore.getState()
                    const b = st.project.buildings[focus.index]
                    st.checkpoint()
                    st.updateBuilding(b.id, { roof: { ...b.roof, pitch: Number(e.target.value) } })
                  }}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((p) => (
                    <option key={p} value={p}>
                      {p}:12
                    </option>
                  ))}
                </select>
              )}
              <select
                value={roof.material}
                title="Roof material"
                onChange={(e) => {
                  const st = useStore.getState()
                  const b = st.project.buildings[focus.index]
                  st.checkpoint()
                  st.updateBuilding(b.id, { roof: { ...b.roof, material: e.target.value as any } })
                }}
              >
                <option value="shingles">Shingles</option>
                <option value="metal">Metal</option>
              </select>
            </>
          )}
        </div>
      )}
      <div className="canvas-hint scene3d-hint">
        {winMode
          ? 'Click any wall to add a window · Esc to finish'
          : closed
            ? 'Finished exterior — adjust roof style, pitch and material above'
            : 'Drag to orbit · scroll to zoom · click items to select, drag to move · edits in 2D regenerate this view automatically'}
      </div>
      <div className="zoom-controls">
        <button title="Recenter view" onClick={() => (mountRef.current as any)?.__recenter?.()}>
          ⌂
        </button>
      </div>
    </div>
  )
}
