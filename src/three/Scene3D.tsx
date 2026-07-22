import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useStore } from '../model/store'
import { buildProject, disposePlan, type BuiltProject } from './buildScene'
import { rotatePt, snapTo } from '../model/geometry'
import { DEFAULT_SUN, type SavedCamera } from '../model/types'
import { exportGlb, snapshotPng } from '../export/model3d'

// ---------- first-person walkthrough ----------
const EYE_HEIGHT = 66 // inches — the project's world unit
const WALK_SPEED = 110 // in/sec (~9 ft/s)
const RUN_MULT = 2.4
const LOOK_SENS = 0.0022 // radians per pixel
const PITCH_LIMIT = THREE.MathUtils.degToRad(85)
/** e.code -> [strafe, forward] */
const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

const FLY_MS = 900 // saved-camera tween duration

/** 13.5 -> "1:30 pm" */
function fmtHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const ap = hh >= 12 ? 'pm' : 'am'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`
}

/** Sun direction for an hour in 6..20: rises east (+x), noon south (+z), sets west (-x). */
const _sunDir = new THREE.Vector3()
function sunVector(hour: number) {
  const t = THREE.MathUtils.clamp((hour - 6) / 14, 0, 1)
  const el = THREE.MathUtils.degToRad(6 + 62 * Math.sin(Math.PI * t))
  const az = Math.PI * t // 0 = +x (east) .. PI = -x (west)
  _sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el))
  // warm and dim near the horizon, neutral and bright at midday
  const noon = Math.sin(Math.PI * t) // 0 at the ends, 1 at 1pm
  return {
    dir: _sunDir,
    color: new THREE.Color().setHSL(0.09 - 0.05 * noon, 0.55 - 0.5 * noon, 0.5 + 0.12 * noon),
    intensity: 0.55 + 1.5 * noon,
    ambient: 0.55 + 0.55 * noon,
  }
}

interface WalkState {
  yaw: number
  pitch: number
  /** orbit camera captured on enter, restored verbatim on exit */
  savedPos: THREE.Vector3
  savedTarget: THREE.Vector3
  keys: Set<string>
  run: boolean
  /** world y of the floor being walked; the eye sits at baseY + EYE_HEIGHT */
  baseY: number
}

interface FlyState {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  start: number
}

interface ThreeState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  built: BuiltProject | null
  selectionBox: THREE.BoxHelper | null
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  raf: number
  /** single authority over who drives the camera — see the loop's switch */
  camMode: 'orbit' | 'walk' | 'fly'
  walk: WalkState | null
  fly: FlyState | null
  /** true while a PNG/GLB export is in flight: blocks recalls that would rebuild */
  exporting: boolean
  frameVisible?: () => void
  rebuild?: (fit: boolean) => void
  enterWalk?: () => void
  exitWalk?: () => void
  flyTo?: (cam: SavedCamera) => void
  cancelFly?: () => void
  applySun?: () => void
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
  const [walking, setWalking] = useState(false)
  const [busy, setBusy] = useState<null | 'png' | 'glb'>(null)
  const [playing, setPlaying] = useState(false)
  const tourRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // false until a slider gesture actually changes the hour
  const sunDirtyRef = useRef(false)
  const sun = useStore((s) => s.project.sun ?? DEFAULT_SUN)
  // bookmarks belong to the view they were taken in
  const cameras = useStore((s) => s.project.cameras)
  const scopeId = useStore((s) =>
    focus.scope === 'plot' ? 'plot' : (s.project.buildings[focus.index]?.id ?? 'plot')
  )
  const myCameras = (cameras ?? []).filter((c) => c.scope === scopeId)
  const canWalk =
    typeof document !== 'undefined' &&
    'requestPointerLock' in HTMLElement.prototype &&
    !(navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches)

  // Start with the full model ('all' — floors stacked); picking a floor isolates it.
  const [visFloor, setVisFloor] = useState<'all' | number>('all')
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
  }, [closed, roof?.style, roof?.pitch, roof?.material, roof?.ridge, roof?.shedLow])

  // enter/exit first-person: React owns the flag, the three side owns the camera swap
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    if (walking) st.enterWalk?.()
    else st.exitWalk?.()
  }, [walking])

  // sun changes mutate the lights in place — never a scene rebuild
  useEffect(() => {
    stateRef.current?.applySun?.()
  }, [sun.hour, sun.shadows])

  // a tour needs at least two bookmarks — deleting below that must also kill the
  // timer, not just the flag (the Stop button unmounts at that point)
  useEffect(() => {
    if (playing && myCameras.length < 2) {
      clearTimeout(tourRef.current)
      tourRef.current = undefined
      setPlaying(false)
    }
  }, [playing, myCameras.length])

  // the tour's timer chain outlives the render that started it — everything it
  // reads must come from a ref, or later hops compare against stale state
  const camsRef = useRef(myCameras)
  camsRef.current = myCameras
  const floorCountRef = useRef(floorCount)
  floorCountRef.current = floorCount

  /** Restore a saved view: match its floor/closed state, then tween the camera. */
  const recall = (c: SavedCamera) => {
    const st = stateRef.current
    if (!st) return
    if (c.closed !== closedRef.current) setClosed(c.closed)
    // a bookmark can outlive the floor it was taken on
    const vis = typeof c.vis === 'number' ? Math.min(c.vis, floorCountRef.current - 1) : 'all'
    if (vis !== visRef.current) setVisFloor(vis)
    st.flyTo?.(c)
  }

  const stopTour = () => {
    clearTimeout(tourRef.current)
    tourRef.current = undefined
    setPlaying(false)
  }

  const startTour = () => {
    if (camsRef.current.length < 2) return
    setWalking(false)
    setPlaying(true)
    let i = 0
    const step = () => {
      const st = stateRef.current
      // re-read the live list: bookmarks can be deleted mid-tour
      const list = camsRef.current
      if (!st || st.exporting || list.length < 2) {
        stopTour()
        return
      }
      if (i >= list.length) i = 0
      recall(list[i])
      i = (i + 1) % list.length
      tourRef.current = setTimeout(step, FLY_MS + 1400)
    }
    step()
  }

  // never leave a tour timer running after the view closes
  useEffect(() => () => clearTimeout(tourRef.current), [])

  const fileBase = () => {
    const p = useStore.getState().project
    const name = focus.scope === 'building' ? p.buildings[focus.index]?.name : 'site'
    return (name ?? 'model').replace(/[^a-z0-9._-]+/gi, '-').toLowerCase()
  }

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
      hemi,
      raf: 0,
      camMode: 'orbit',
      walk: null,
      fly: null,
      exporting: false,
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
      // Never fight whoever is driving the camera. Recalling a bookmark changes the
      // floor/shell first, and those effects reframe — without this guard the reframe
      // would cancel the tween the recall just started. Explicit reframes (the ⌂
      // button) call cancelFly() themselves before calling in here.
      if (st.camMode !== 'orbit') return
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

    // ---------- camera authority ----------
    // OrbitControls bails out of onPointerDown when `enabled === false`, BEFORE it
    // dispatches 'start' — so a tween must keep controls enabled (or the user could
    // never grab the camera back), while walk mode must disable them.
    const setCamMode = (next: ThreeState['camMode']) => {
      st.camMode = next
      controls.enabled = next !== 'walk'
      camera.rotation.order = next === 'walk' ? 'YXZ' : 'XYZ'
    }

    // ---------- first-person walkthrough ----------
    // Isolating a floor drops its group to y=0 (see applyVisibility); 'all' keeps
    // real elevations, so walk the ground floor there.
    const walkBaseY = () => {
      if (focus.scope !== 'building' || !st.built) return 0
      const sel = closedRef.current ? 'all' : visRef.current
      if (sel !== 'all') return 0
      return st.built.floorGroups.find((fg) => fg.floor === 0)?.baseY ?? 0
    }

    const enterWalk = () => {
      if (st.walk) return
      st.cancelFly?.()
      controls.update() // fold in pending damping so the restore lands exactly here
      const savedPos = camera.position.clone()
      const savedTarget = controls.target.clone()
      const dir = new THREE.Vector3().subVectors(savedTarget, savedPos)
      const baseY = walkBaseY()
      st.walk = {
        // with rotation order YXZ, forward = (-sin yaw, 0, -cos yaw)
        yaw: Math.atan2(-dir.x, -dir.z),
        pitch: 0,
        savedPos,
        savedTarget,
        keys: new Set(),
        run: false,
        baseY,
      }
      setCamMode('walk')
      // stand where you were looking, facing the same way
      camera.position.set(savedTarget.x, baseY + EYE_HEIGHT, savedTarget.z)
      camera.rotation.set(0, st.walk.yaw, 0)
      // pointer lock needs the click's transient activation, which this effect is
      // still inside. If it's refused we stay in walk mode (keys still work).
      const lock = renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined
      lock?.catch(() => {})
    }

    const exitWalk = () => {
      const walk = st.walk
      if (!walk) return
      st.walk = null // cleared first so the lock-change handler sees nothing to do
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
      camera.position.copy(walk.savedPos)
      controls.target.copy(walk.savedTarget)
      setCamMode('orbit')
      controls.update() // re-derives the orbit spherical from position - target
    }
    st.enterWalk = enterWalk
    st.exitWalk = exitWalk

    // ---------- saved-camera tween ----------
    const cancelFly = () => {
      if (!st.fly) return
      st.fly = null
      if (st.camMode === 'fly') setCamMode('orbit')
    }
    st.cancelFly = cancelFly

    const flyTo = (cam: SavedCamera) => {
      if (st.camMode === 'walk') exitWalk()
      st.fly = {
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(cam.px, cam.py, cam.pz),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(cam.tx, cam.ty, cam.tz),
        start: performance.now(),
      }
      setCamMode('fly') // controls stay enabled: grabbing them cancels the tween
    }
    st.flyTo = flyTo

    // ---------- sun ----------
    const applySun = () => {
      const spec = useStore.getState().project.sun ?? DEFAULT_SUN
      const { dir, color, intensity, ambient } = sunVector(spec.hour)
      const center = st.built?.center ?? new THREE.Vector3()
      const radius = Math.max(st.built?.radius ?? 300, 120)
      sun.position.set(
        center.x + dir.x * radius * 2.4,
        center.y + dir.y * radius * 2.4,
        center.z + dir.z * radius * 2.4
      )
      sun.target.position.copy(center)
      sun.target.updateMatrixWorld()
      sun.color.copy(color)
      sun.intensity = intensity
      sun.castShadow = spec.shadows
      hemi.intensity = ambient
      // low sun casts long shadows — widen the frustum so they stay inside the map
      const stretch = 1 + 1.6 * (1 - Math.max(0.12, dir.y))
      const r = radius * 1.8 * stretch
      const cam = sun.shadow.camera as THREE.OrthographicCamera
      cam.left = -r
      cam.right = r
      cam.top = r
      cam.bottom = -r
      cam.near = 1
      cam.far = radius * 10
      cam.updateProjectionMatrix()
      scene.background = new THREE.Color(
        useStore.getState().theme === 'dark' ? '#1a1c20' : '#eceef1'
      )
    }
    st.applySun = applySun

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
      applySun() // sun follows the new model's center/radius
      applyVisibility(fit)
      syncSelectionBox()
    }

    st.rebuild = rebuild
    rebuild(true)

    let timer: ReturnType<typeof setTimeout> | undefined
    let lastProject = useStore.getState().project
    let lastSel = useStore.getState().selection
    let lastTheme = useStore.getState().theme
    // Only geometry changes need a rebuild. Sun/camera edits replace `project` too,
    // and rebuilding on every sun-slider tick would be unusable. NOTE: any future
    // action that mutates a Floor in place instead of replacing `buildings` by
    // reference will silently stop triggering rebuilds.
    const geomKeys = ['buildings', 'site', 'terrain', 'plotBoundary', 'plotW', 'plotD'] as const
    const geomSame = (a: typeof lastProject, b: typeof lastProject) =>
      geomKeys.every((k) => a[k] === b[k])
    const unsub = useStore.subscribe((s) => {
      if (s.project !== lastProject) {
        const prev = lastProject
        lastProject = s.project
        if (!geomSame(prev, s.project)) {
          clearTimeout(timer)
          timer = setTimeout(() => rebuild(false), 140)
        }
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
      // pointer-locked clicks carry meaningless coordinates — never raycast them
      if (st.camMode === 'walk') return
      // grabbing the camera mid-tween cancels it (raycasts would be off anyway)
      if (st.camMode === 'fly') {
        cancelFly()
        return
      }
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
        if (st.camMode === 'orbit') controls.enabled = true
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    // ---------- keyboard ----------
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // priority: walking > touring > window-placement
        if (st.walk) setWalking(false)
        else setWinMode(false)
        return
      }
      const walk = st.walk
      if (!walk) return
      if (MOVE_KEYS[e.code]) {
        walk.keys.add(e.code)
        e.preventDefault() // arrows must not scroll the page while walking
      }
      walk.run = e.shiftKey
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const walk = st.walk
      if (!walk) return
      walk.keys.delete(e.code)
      walk.run = e.shiftKey
    }
    // a lost window drops every held key, or the walker keeps gliding
    const onBlur = () => {
      if (st.walk) {
        st.walk.keys.clear()
        st.walk.run = false
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      const walk = st.walk
      if (!walk || document.pointerLockElement !== renderer.domElement) return
      walk.yaw -= e.movementX * LOOK_SENS
      walk.pitch = THREE.MathUtils.clamp(
        walk.pitch - e.movementY * LOOK_SENS,
        -PITCH_LIMIT,
        PITCH_LIMIT
      )
    }
    // releasing the lock (Esc, alt-tab) leaves walk mode so the UI agrees
    const onLockChange = () => {
      if (st.walk && document.pointerLockElement !== renderer.domElement) setWalking(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onLockChange)

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    const clock = new THREE.Clock()
    const move = new THREE.Vector3()
    const loop = () => {
      st.raf = requestAnimationFrame(loop)
      const dt = Math.min(clock.getDelta(), 0.1) // clamp so a stalled tab can't teleport
      if (st.camMode === 'walk' && st.walk) {
        const walk = st.walk
        camera.rotation.set(walk.pitch, walk.yaw, 0)
        let strafe = 0
        let forward = 0
        for (const code of walk.keys) {
          const v = MOVE_KEYS[code]
          if (v) {
            strafe += v[0]
            forward += v[1]
          }
        }
        if (strafe || forward) {
          const speed = WALK_SPEED * (walk.run ? RUN_MULT : 1) * dt
          // walk on the level: forward follows yaw only, never the pitch
          move
            .set(strafe, 0, -forward)
            .normalize()
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), walk.yaw)
          camera.position.addScaledVector(move, speed)
        }
        camera.position.y = walk.baseY + EYE_HEIGHT
      } else if (st.camMode === 'fly' && st.fly) {
        const f = st.fly
        const raw = (performance.now() - f.start) / FLY_MS
        const t = raw >= 1 ? 1 : raw * raw * (3 - 2 * raw) // smoothstep
        camera.position.lerpVectors(f.fromPos, f.toPos, t)
        controls.target.lerpVectors(f.fromTarget, f.toTarget, t)
        controls.update()
        if (raw >= 1) cancelFly()
      } else {
        controls.update()
      }
      renderer.render(scene, camera)
    }
    loop()

    ;(mount as any).__recenter = () => {
      // an explicit recenter outranks a tween (frameVisible itself yields to one)
      st.cancelFly?.()
      st.frameVisible?.()
    }

    // scripted-testing handle (dev only)
    if (import.meta.env.DEV) (globalThis as any).__scene3d = st

    return () => {
      cancelAnimationFrame(st.raf)
      unsub()
      clearTimeout(timer)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      // leaving 3D while walking must not strand the pointer lock
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
      if (st.built) disposePlan(st.built.group)
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      // identity-guarded: StrictMode double-mounts in dev, so only clear our own
      if (import.meta.env.DEV && (globalThis as any).__scene3d === st) {
        delete (globalThis as any).__scene3d
      }
      stateRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="scene3d-wrap">
      <div ref={mountRef} className="scene3d-mount" />
      {walking && <div className="walk-crosshair" />}
      {!walking && myCameras.length > 0 && (
        <div className="scene3d-cams">
          {myCameras.map((c) => (
            <div className="cam-row" key={c.id}>
              <button
                className="cam-go"
                title={`Fly to ${c.name}`}
                onClick={() => {
                  const st = stateRef.current
                  if (!st || st.exporting) return
                  stopTour()
                  setWalking(false)
                  recall(c)
                }}
              >
                {c.name}
              </button>
              <button
                className="cam-x"
                title="Rename"
                onClick={() => {
                  const name = prompt('Camera name', c.name)?.trim()
                  if (name) useStore.getState().updateCamera(c.id, { name })
                }}
              >
                ✎
              </button>
              <button
                className="cam-x"
                title="Delete this view"
                onClick={() => useStore.getState().deleteCamera(c.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {floorCount > 1 && !closed && !walking && (
        <div className="floor-vis" role="toolbar" aria-label="Floor visibility">
          <button
            className={visFloor === 'all' ? 'active' : ''}
            onClick={() => setVisFloor('all')}
            title="Stack all floors"
          >
            All
          </button>
          {Array.from({ length: floorCount }, (_, i) => (
            <button
              key={i}
              className={visFloor === i ? 'active' : ''}
              onClick={() => setVisFloor(i)}
              title={`Show floor ${i + 1} only`}
            >
              Floor {i + 1}
            </button>
          ))}
        </div>
      )}
      {!walking && (
        <div className="sun-controls">
          <span className="sun-label">{fmtHour(sun.hour)}</span>
          <input
            type="range"
            min={6}
            max={20}
            step={0.25}
            value={sun.hour}
            aria-label="Time of day"
            title="Time of day — drives the sun angle, colour and shadows"
            // one undo entry per drag, and none at all for a click that changes
            // nothing (an unconditional checkpoint would wipe the redo stack)
            onPointerDown={() => (sunDirtyRef.current = false)}
            onChange={(e) => {
              const first = !sunDirtyRef.current
              sunDirtyRef.current = true
              useStore.getState().setSun({ hour: Number(e.target.value) }, first)
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              sunDirtyRef.current = false
            }}
          />
          <button
            className={sun.shadows ? 'active' : ''}
            title="Toggle shadows"
            onClick={() => useStore.getState().setSun({ shadows: !sun.shadows }, true)}
          >
            ☀
          </button>
        </div>
      )}
      <div className="scene3d-controls">
        {focus.scope === 'building' && !walking && (
          <>
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
          </>
        )}
        {focus.scope === 'building' && !walking && closed && roof && (
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
                <option value="shed">Shed</option>
                <option value="flat">Flat</option>
              </select>
              {roof.style !== 'flat' && (
                <>
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
                  {roof.style === 'gable' && (
                    <select
                      value={roof.ridge ?? 'auto'}
                      title="Ridge direction"
                      onChange={(e) => {
                        const st = useStore.getState()
                        const b = st.project.buildings[focus.index]
                        st.checkpoint()
                        st.updateBuilding(b.id, { roof: { ...b.roof, ridge: e.target.value as any } })
                      }}
                    >
                      <option value="auto">Ridge: auto</option>
                      <option value="ew">Ridge ↔</option>
                      <option value="ns">Ridge ↕</option>
                    </select>
                  )}
                  {roof.style === 'shed' && (
                    <select
                      value={roof.shedLow ?? 's'}
                      title="Shed low side"
                      onChange={(e) => {
                        const st = useStore.getState()
                        const b = st.project.buildings[focus.index]
                        st.checkpoint()
                        st.updateBuilding(b.id, { roof: { ...b.roof, shedLow: e.target.value as any } })
                      }}
                    >
                      <option value="n">Low: N</option>
                      <option value="s">Low: S</option>
                      <option value="e">Low: E</option>
                      <option value="w">Low: W</option>
                    </select>
                  )}
                </>
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
        {canWalk && (
          <button
            className={walking ? 'active' : ''}
            disabled={!!busy}
            onClick={() => {
              if (walking) {
                setWalking(false)
                return
              }
              stopTour()
              setWinMode(false)
              setWalking(true)
            }}
            title="Walk through the model (WASD / arrows, Shift to run, Esc to exit)"
          >
            🚶 Walk
          </button>
        )}
        {!walking && (
          <>
            <button
              disabled={!!busy}
              title="Save this viewpoint"
              onClick={() => {
                const st = stateRef.current
                if (!st) return
                st.cancelFly?.()
                const name = prompt('Name this view', `View ${myCameras.length + 1}`)?.trim()
                if (!name) return
                useStore.getState().addCamera({
                  name,
                  px: st.camera.position.x,
                  py: st.camera.position.y,
                  pz: st.camera.position.z,
                  tx: st.controls.target.x,
                  ty: st.controls.target.y,
                  tz: st.controls.target.z,
                  scope: scopeId,
                  closed,
                  vis: visFloor,
                })
              }}
            >
              ＋ View
            </button>
            {myCameras.length > 1 && (
              <button
                className={playing ? 'active' : ''}
                disabled={!!busy}
                title="Tour the saved views"
                onClick={() => (playing ? stopTour() : startTour())}
              >
                {playing ? '⏹ Stop' : '▶ Tour'}
              </button>
            )}
            <button
              disabled={!!busy}
              title="Download a high-resolution PNG of this view"
              onClick={async () => {
                const st = stateRef.current
                if (!st) return
                st.cancelFly?.()
                setBusy('png')
                st.exporting = true
                try {
                  // yield once so the disabled state paints. setTimeout, not rAF:
                  // rAF never fires in a hidden tab and would strand the button.
                  await new Promise((r) => setTimeout(r, 0))
                  if (!snapshotPng(st.renderer, st.scene, st.camera, 2, `${fileBase()}.png`)) {
                    alert('Could not capture the view.')
                  }
                } finally {
                  st.exporting = false
                  setBusy(null)
                }
              }}
            >
              {busy === 'png' ? '…' : '📷 PNG'}
            </button>
            <button
              disabled={!!busy}
              title="Download the 3D model as .glb (opens in Blender, SketchUp…)"
              onClick={async () => {
                const st = stateRef.current
                if (!st?.built) return
                st.cancelFly?.()
                setBusy('glb')
                st.exporting = true
                try {
                  // isolating a floor drops it to y=0 and hides the rest — export
                  // the whole model at true elevations instead, then put it back
                  for (const fg of st.built.floorGroups) {
                    fg.group.visible = true
                    fg.group.position.y = fg.baseY
                  }
                  const ok = await exportGlb(st.built.group, `${fileBase()}.glb`)
                  if (!ok) alert('Could not export the model.')
                } finally {
                  applyVisibility(false)
                  st.exporting = false
                  setBusy(null)
                }
              }}
            >
              {busy === 'glb' ? '…' : '⬇ GLB'}
            </button>
          </>
        )}
      </div>
      <div className="canvas-hint scene3d-hint">
        {walking
          ? 'Walking — WASD or arrows to move · Shift to run · mouse to look · Esc to exit'
          : playing
            ? 'Touring saved views — click Stop to end'
            : winMode
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
