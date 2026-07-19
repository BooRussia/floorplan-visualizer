import * as THREE from 'three'

// ---------- procedural wood floor texture ----------

function makeWoodTexture(): THREE.Texture {
  const S = 512
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!

  // texture covers 96" x 96" of floor
  const plankH = S / 12 // ~8" planks
  const base = [222, 196, 160]
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  for (let row = 0; row < 12; row++) {
    const y = row * plankH
    // plank segments with staggered joints
    let x = -rand() * S * 0.5
    while (x < S) {
      const w = S * (0.35 + rand() * 0.4)
      const tone = 0.86 + rand() * 0.22
      ctx.fillStyle = `rgb(${base[0] * tone | 0},${base[1] * tone | 0},${base[2] * tone | 0})`
      ctx.fillRect(x, y, w, plankH)
      // subtle grain streaks
      ctx.globalAlpha = 0.08
      for (let g = 0; g < 5; g++) {
        const gy = y + rand() * plankH
        ctx.fillStyle = rand() > 0.5 ? '#8a6a48' : '#fff'
        ctx.fillRect(x + 2, gy, w - 4, 1 + rand() * 1.5)
      }
      ctx.globalAlpha = 1
      // joint line
      ctx.fillStyle = 'rgba(120,95,70,0.55)'
      ctx.fillRect(x + w - 1, y, 1.5, plankH)
      x += w
    }
    // seam between rows
    ctx.fillStyle = 'rgba(120,95,70,0.5)'
    ctx.fillRect(0, y + plankH - 1, S, 1.5)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

let woodTex: THREE.Texture | null = null
export const getWoodTexture = () => (woodTex ??= makeWoodTexture())

// ---------- procedural roof textures ----------
// canvas covers 96" x 96" of roof surface (repeat 1 with world-scaled UVs)

function makeShingleTexture(): THREE.Texture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#565a60'
  ctx.fillRect(0, 0, S, S)
  const course = S / 12 // ~8" exposure
  let seed = 11
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let r = 0; r < 12; r++) {
    const y = r * course
    // tab shadows
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, y + course - 2, S, 2)
    const off = (r % 2) * (S / 16) + rand() * 4
    for (let x = -1; x < 9; x++) {
      const px = x * (S / 8) + off
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(px, y, 1.6, course)
      // slight tonal variation per tab
      const tone = 0.9 + rand() * 0.2
      ctx.fillStyle = `rgba(${86 * tone | 0},${90 * tone | 0},${96 * tone | 0},0.5)`
      ctx.fillRect(px + 1.6, y, S / 8 - 1.6, course - 2)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function makeMetalRoofTexture(): THREE.Texture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, S, 0)
  g.addColorStop(0, '#67707a')
  g.addColorStop(0.5, '#727b85')
  g.addColorStop(1, '#67707a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  // standing seams every 16"
  const seam = S / 6
  for (let i = 0; i <= 6; i++) {
    const x = i * seam
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(x - 1.5, 0, 1.5, S)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(x, 0, 2.2, S)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

let shingleTex: THREE.Texture | null = null
let metalRoofTex: THREE.Texture | null = null
const roofMats = new Map<string, THREE.MeshStandardMaterial>()

/** Material for a roof surface; UVs are expected in 96"-per-repeat world units. */
export function roofSurfaceMaterial(material: 'shingles' | 'metal'): THREE.MeshStandardMaterial {
  let m = roofMats.get(material)
  if (!m) {
    if (material === 'metal') {
      metalRoofTex ??= makeMetalRoofTexture()
      m = new THREE.MeshStandardMaterial({
        map: metalRoofTex,
        roughness: 0.38,
        metalness: 0.55,
        side: THREE.DoubleSide,
      })
    } else {
      shingleTex ??= makeShingleTexture()
      m = new THREE.MeshStandardMaterial({
        map: shingleTex,
        roughness: 0.92,
        metalness: 0.02,
        side: THREE.DoubleSide,
      })
    }
    roofMats.set(material, m)
  }
  return m
}

/** Generic noise/pattern texture factory for ground surfaces. */
function makeNoiseTexture(
  base: [number, number, number],
  speckle: [number, number, number],
  density: number,
  speckSize: number,
  lines?: 'pavers' | 'tile'
): THREE.Texture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`
  ctx.fillRect(0, 0, S, S)
  let seed = 13
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < density; i++) {
    const t = 0.5 + rand()
    ctx.fillStyle = `rgba(${speckle[0] * t | 0},${speckle[1] * t | 0},${speckle[2] * t | 0},${0.25 + rand() * 0.4})`
    const r = speckSize * (0.5 + rand())
    ctx.beginPath()
    ctx.arc(rand() * S, rand() * S, r, 0, Math.PI * 2)
    ctx.fill()
  }
  if (lines === 'pavers') {
    ctx.strokeStyle = 'rgba(120,110,95,0.6)'
    ctx.lineWidth = 2
    const step = S / 4 // 24" pavers over a 96" tile
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath()
      ctx.moveTo(i * step, 0)
      ctx.lineTo(i * step, S)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * step)
      ctx.lineTo(S, i * step)
      ctx.stroke()
    }
  } else if (lines === 'tile') {
    ctx.strokeStyle = 'rgba(140,150,155,0.55)'
    ctx.lineWidth = 1.6
    const step = S / 8 // 12" tiles
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath()
      ctx.moveTo(i * step, 0)
      ctx.lineTo(i * step, S)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * step)
      ctx.lineTo(S, i * step)
      ctx.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

const texCache = new Map<string, THREE.Texture>()
const tex = (key: string, make: () => THREE.Texture) => {
  if (!texCache.has(key)) texCache.set(key, make())
  return texCache.get(key)!
}

export const getGrassTexture = () =>
  tex('grass', () => makeNoiseTexture([124, 152, 96], [88, 122, 66], 900, 2.2))
export const getConcreteTexture = () =>
  tex('concrete', () => makeNoiseTexture([206, 206, 202], [150, 150, 148], 500, 1.6))
export const getAsphaltTexture = () =>
  tex('asphalt', () => makeNoiseTexture([88, 90, 94], [140, 142, 146], 700, 1.4))
export const getGravelTexture = () =>
  tex('gravel', () => makeNoiseTexture([190, 184, 170], [120, 112, 98], 1400, 2.6))
export const getPaversTexture = () =>
  tex('pavers', () => makeNoiseTexture([210, 198, 178], [160, 148, 128], 300, 1.6, 'pavers'))
export const getMulchTexture = () =>
  tex('mulch', () => makeNoiseTexture([118, 88, 62], [70, 48, 32], 1200, 2.8))
export const getTileTexture = () =>
  tex('tile', () => makeNoiseTexture([232, 236, 237], [200, 208, 210], 200, 1.4, 'tile'))
export const getStoneTexture = () =>
  tex('stone', () => makeNoiseTexture([176, 170, 156], [120, 114, 100], 600, 2.4))

// ---------- shared materials ----------

const std = (color: string, roughness = 0.85, metalness = 0.02) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })

export const MAT = {
  floor: () =>
    new THREE.MeshStandardMaterial({ map: getWoodTexture(), roughness: 0.7, metalness: 0.02 }),
  slab: std('#dfdfe4', 0.9),
  ground: std('#e9e9ed', 0.95),
  wall: std('#fafafa', 0.92),
  wallCap: std('#c9c9cf', 0.9),
  tile: std('#f0f0f2', 0.55),
  fabric: std('#f4f3f0', 0.95),
  fabricDark: std('#e4e2dd', 0.95),
  accent: std('#7ba6c9', 0.9),
  accent2: std('#4f7ea8', 0.9),
  wood: std('#cfa878', 0.75),
  woodDark: std('#9c7a54', 0.75),
  white: std('#ffffff', 0.6),
  ceramic: std('#ffffff', 0.28, 0.05),
  appliance: std('#eef0f2', 0.35, 0.35),
  steel: std('#b9bec3', 0.35, 0.7),
  dark: std('#26272b', 0.5),
  screen: std('#131417', 0.25, 0.4),
  leaf: std('#7fa374', 0.85),
  pot: std('#d8d3cb', 0.85),
  doorLeaf: std('#ffffff', 0.7),
  frame: std('#e8e8ea', 0.7),
  glass: new THREE.MeshStandardMaterial({
    color: '#cfe0ea',
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
  }),
  rug: std('#e7e4de', 1),
  rugBorder: std('#cdc9c0', 1),
  carPaint: std('#8fa8bf', 0.35, 0.6),
  carDark: std('#3c4249', 0.5, 0.3),
  tire: std('#26272b', 0.9),
  toolRed: std('#b8412f', 0.45, 0.25),
  hullNavy: std('#3d5a80', 0.4, 0.3),
  camperShell: std('#f2f1ec', 0.5, 0.15),
  roof: std('#6d7178', 0.92),
  fenceWood: std('#c9b18e', 0.85),
  fenceWhite: std('#f4f4f2', 0.8),
  chainMetal: std('#a9adb2', 0.5, 0.6),
  trunk: std('#7d6248', 0.9),
  leafDark: std('#5d7f52', 0.9),
  stone: std('#b3ada0', 0.95),
  flower1: std('#d96a7f', 0.85),
  flower2: std('#e5c04f', 0.85),
  flower3: std('#8f78c9', 0.85),
}

/** Floor material for painted rooms. */
export function roomFloorMaterial(material: string): THREE.MeshStandardMaterial {
  switch (material) {
    case 'tile':
      return new THREE.MeshStandardMaterial({ map: getTileTexture(), roughness: 0.35 })
    case 'carpet':
      return new THREE.MeshStandardMaterial({ color: '#cfc8bd', roughness: 1 })
    case 'concrete':
      return new THREE.MeshStandardMaterial({ map: getConcreteTexture(), roughness: 0.85 })
    case 'stone':
      return new THREE.MeshStandardMaterial({ map: getStoneTexture(), roughness: 0.8 })
    default:
      return new THREE.MeshStandardMaterial({ map: getWoodTexture(), roughness: 0.7, metalness: 0.02 })
  }
}

/** Ground surface material for site patches. */
export function surfaceMaterial(kind: string): THREE.MeshStandardMaterial {
  switch (kind) {
    case 'surface-asphalt':
      return new THREE.MeshStandardMaterial({ map: getAsphaltTexture(), roughness: 0.95 })
    case 'surface-gravel':
      return new THREE.MeshStandardMaterial({ map: getGravelTexture(), roughness: 1 })
    case 'surface-pavers':
      return new THREE.MeshStandardMaterial({ map: getPaversTexture(), roughness: 0.85 })
    case 'surface-mulch':
      return new THREE.MeshStandardMaterial({ map: getMulchTexture(), roughness: 1 })
    default:
      return new THREE.MeshStandardMaterial({ map: getConcreteTexture(), roughness: 0.9 })
  }
}
