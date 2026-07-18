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
}
