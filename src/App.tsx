import { lazy, Suspense } from 'react'
import Toolbar from './ui/Toolbar'
import ToolRail from './ui/ToolRail'
import Palette from './ui/Palette'
import PropertiesPanel from './ui/PropertiesPanel'
import Editor2D from './editor2d/Editor2D'
import Scene3D from './three/Scene3D'
import { useStore } from './model/store'

const SiteImportModal = lazy(() => import('./site-import/SiteImportModal'))

export default function App() {
  const view = useStore((s) => s.view)
  const siteImportOpen = useStore((s) => s.siteImportOpen)
  const setSiteImportOpen = useStore((s) => s.setSiteImportOpen)
  return (
    <div className="app">
      <Toolbar />
      <div className="app-body">
        {view === '2d' && <ToolRail />}
        {view === '2d' && <Palette />}
        <main className="app-main">{view === '2d' ? <Editor2D /> : <Scene3D />}</main>
        <PropertiesPanel />
      </div>
      {siteImportOpen && (
        <Suspense fallback={<div className="site-import-scrim" />}>
          <SiteImportModal onClose={() => setSiteImportOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
