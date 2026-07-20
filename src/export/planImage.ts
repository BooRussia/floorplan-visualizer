// PNG export of the 2D editor canvas: serialize the live SVG, resolve the CSS
// custom-property colors (var() doesn't work inside an <img> render), rasterize 2x.

export async function exportPlanPng(filename = 'floorplan.png'): Promise<boolean> {
  const svg = document.querySelector('.editor-canvas svg') as SVGSVGElement | null
  if (!svg) return false
  let src = new XMLSerializer().serializeToString(svg)
  const cs = getComputedStyle(document.documentElement)
  src = src.replace(/var\((--[a-z0-9-]+)\)/gi, (_m, name: string) => {
    const v = cs.getPropertyValue(name).trim()
    return v || '#000'
  })
  const blob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('svg rasterize failed'))
      img.src = url
    })
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = svg.clientWidth * scale
    canvas.height = svg.clientHeight * scale
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!png) return false
    const a = document.createElement('a')
    a.href = URL.createObjectURL(png)
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    return true
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(url)
  }
}
