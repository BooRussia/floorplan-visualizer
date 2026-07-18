import Toolbar from './ui/Toolbar'
import Palette from './ui/Palette'
import PropertiesPanel from './ui/PropertiesPanel'
import Editor2D from './editor2d/Editor2D'
import Scene3D from './three/Scene3D'
import { useStore } from './model/store'

export default function App() {
  const view = useStore((s) => s.view)
  return (
    <div className="app">
      <Toolbar />
      <div className="app-body">
        {view === '2d' && <Palette />}
        <main className="app-main">{view === '2d' ? <Editor2D /> : <Scene3D />}</main>
        <PropertiesPanel />
      </div>
    </div>
  )
}
