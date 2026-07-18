import { useState } from 'react'
import { CATALOG } from '../model/catalog'
import { useStore } from '../model/store'
import { GlyphPreview } from '../editor2d/glyphs'

const PLOT_CATS = ['Landscape', 'Surfaces', 'Garage']

export default function Palette() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const isPlot = useStore((s) => s.mode.scope === 'plot')
  const [open, setOpen] = useState<Record<string, boolean>>({
    Kitchen: true,
    Bathroom: true,
    Bedroom: true,
    'Living room': true,
    Dining: true,
    Landscape: true,
    Surfaces: true,
  })

  const cats = CATALOG.filter((c) =>
    isPlot ? PLOT_CATS.includes(c.name) : !['Landscape', 'Surfaces'].includes(c.name)
  )

  return (
    <aside className="palette">
      <div className="palette-header">{isPlot ? 'Site library' : 'Library'}</div>
      <div className="palette-scroll">
        {cats.map((cat) => (
          <section key={cat.name} className="palette-cat">
            <button
              className="palette-cat-title"
              onClick={() => setOpen((o) => ({ ...o, [cat.name]: !o[cat.name] }))}
              aria-expanded={!!open[cat.name]}
            >
              <span className={`chev ${open[cat.name] ? 'open' : ''}`}>▸</span>
              {cat.name}
            </button>
            {open[cat.name] && (
              <div className="palette-grid">
                {cat.items.map((item) => {
                  const active = tool.type === 'place' && tool.kind === item.kind
                  return (
                    <button
                      key={item.kind}
                      className={`palette-item ${active ? 'active' : ''}`}
                      title={`${item.name} — click, then click the plan to place`}
                      onClick={() =>
                        active ? setTool({ type: 'select' }) : setTool({ type: 'place', kind: item.kind })
                      }
                    >
                      <GlyphPreview kind={item.kind} w={item.w} d={item.d} />
                      <span className="palette-item-name">{item.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </aside>
  )
}
