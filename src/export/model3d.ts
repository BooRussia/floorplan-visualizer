// 3D view exports: high-res PNG snapshot and a .glb of the built model.
// Both take the live renderer/scene/camera so nothing here knows about React.

import * as THREE from 'three'

const download = (blob: Blob, filename: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

/**
 * Snapshot the current view at `scale`x resolution. The renderer has no
 * preserveDrawingBuffer, so we resize, render, and read the buffer inside the
 * same frame, then restore the previous size/aspect.
 */
export function snapshotPng(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  scale = 2,
  filename = 'floorplan-3d.png'
): boolean {
  const size = new THREE.Vector2()
  renderer.getSize(size)
  const prevPixelRatio = renderer.getPixelRatio()
  try {
    renderer.setPixelRatio(Math.min(scale * prevPixelRatio, 4))
    renderer.render(scene, camera)
    const url = renderer.domElement.toDataURL('image/png')
    // dataURL -> blob without a fetch round-trip
    const bin = atob(url.split(',')[1])
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    download(new Blob([buf], { type: 'image/png' }), filename)
    return true
  } catch {
    return false
  } finally {
    renderer.setPixelRatio(prevPixelRatio)
    renderer.setSize(size.x, size.y, false)
    renderer.render(scene, camera)
  }
}

/** Export the built model group as binary glTF (.glb). Exporter is lazy-loaded. */
export async function exportGlb(
  group: THREE.Object3D,
  filename = 'floorplan.glb'
): Promise<boolean> {
  try {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
    const exporter = new GLTFExporter()
    const result = await exporter.parseAsync(group, { binary: true, onlyVisible: false })
    const blob =
      result instanceof ArrayBuffer
        ? new Blob([result], { type: 'model/gltf-binary' })
        : new Blob([JSON.stringify(result)], { type: 'model/gltf+json' })
    download(blob, result instanceof ArrayBuffer ? filename : filename.replace(/\.glb$/, '.gltf'))
    return true
  } catch {
    return false
  }
}
