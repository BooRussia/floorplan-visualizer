// Furniture catalog: default real-world dimensions in inches.
// w = width (local x), d = depth (local y), h = height.

export interface CatalogItem {
  kind: string
  name: string
  w: number
  d: number
  h: number
}

export interface CatalogCategory {
  name: string
  items: CatalogItem[]
}

export const CATALOG: CatalogCategory[] = [
  {
    name: 'Structure',
    items: [
      // depth (run) and height are auto-computed from the floor's height when placed
      { kind: 'staircase', name: 'Staircase', w: 36, d: 136, h: 106 },
    ],
  },
  {
    name: 'Kitchen',
    items: [
      { kind: 'base-cabinet', name: 'Base cabinet', w: 36, d: 24, h: 36 },
      { kind: 'kitchen-island', name: 'Island', w: 66, d: 36, h: 36 },
      { kind: 'kitchen-sink', name: 'Sink cabinet', w: 33, d: 24, h: 36 },
      { kind: 'stove', name: 'Range / stove', w: 30, d: 26, h: 36 },
      { kind: 'fridge', name: 'Refrigerator', w: 36, d: 30, h: 70 },
      { kind: 'dishwasher', name: 'Dishwasher', w: 24, d: 24, h: 34 },
      { kind: 'washer', name: 'Washer', w: 27, d: 28, h: 38 },
      { kind: 'dryer', name: 'Dryer', w: 27, d: 28, h: 38 },
    ],
  },
  {
    name: 'Bathroom',
    items: [
      { kind: 'toilet', name: 'Toilet', w: 20, d: 28, h: 30 },
      { kind: 'vanity', name: 'Vanity sink', w: 30, d: 21, h: 34 },
      { kind: 'pedestal-sink', name: 'Pedestal sink', w: 22, d: 18, h: 34 },
      { kind: 'shower', name: 'Shower', w: 36, d: 36, h: 80 },
      { kind: 'bathtub', name: 'Bathtub', w: 60, d: 30, h: 22 },
    ],
  },
  {
    name: 'Bedroom',
    items: [
      { kind: 'bed-queen', name: 'Queen bed', w: 60, d: 80, h: 26 },
      { kind: 'bed-king', name: 'King bed', w: 76, d: 80, h: 26 },
      { kind: 'bed-twin', name: 'Twin bed', w: 38, d: 75, h: 24 },
      { kind: 'nightstand', name: 'Nightstand', w: 20, d: 16, h: 24 },
      { kind: 'dresser', name: 'Dresser', w: 60, d: 18, h: 32 },
      { kind: 'wardrobe', name: 'Wardrobe', w: 48, d: 24, h: 78 },
      { kind: 'desk', name: 'Desk', w: 48, d: 24, h: 30 },
      { kind: 'office-chair', name: 'Desk chair', w: 22, d: 22, h: 36 },
    ],
  },
  {
    name: 'Living room',
    items: [
      { kind: 'sofa', name: 'Sofa', w: 84, d: 36, h: 32 },
      { kind: 'loveseat', name: 'Loveseat', w: 60, d: 36, h: 32 },
      { kind: 'armchair', name: 'Armchair', w: 34, d: 34, h: 32 },
      { kind: 'coffee-table', name: 'Coffee table', w: 48, d: 24, h: 17 },
      { kind: 'end-table', name: 'End table', w: 20, d: 20, h: 22 },
      { kind: 'tv-stand', name: 'TV + stand', w: 60, d: 16, h: 44 },
      { kind: 'floor-lamp', name: 'Floor lamp', w: 16, d: 16, h: 62 },
      { kind: 'table-lamp', name: 'Table lamp', w: 12, d: 12, h: 22 },
      { kind: 'bookshelf', name: 'Bookshelf', w: 36, d: 12, h: 72 },
      { kind: 'rug', name: 'Area rug', w: 96, d: 60, h: 1 },
      { kind: 'plant', name: 'Plant', w: 18, d: 18, h: 52 },
    ],
  },
  {
    name: 'Dining',
    items: [
      { kind: 'dining-table', name: 'Dining table', w: 72, d: 38, h: 30 },
      { kind: 'round-table', name: 'Round table', w: 48, d: 48, h: 30 },
      { kind: 'chair', name: 'Chair', w: 18, d: 20, h: 34 },
      { kind: 'bar-stool', name: 'Bar stool', w: 16, d: 16, h: 30 },
    ],
  },
  {
    name: 'Landscape',
    items: [
      { kind: 'tree-oak', name: 'Shade tree', w: 220, d: 220, h: 300 },
      { kind: 'tree-pine', name: 'Pine tree', w: 140, d: 140, h: 340 },
      { kind: 'shrub', name: 'Shrub', w: 30, d: 30, h: 30 },
      { kind: 'flower-bed', name: 'Flower bed', w: 90, d: 50, h: 8 },
      { kind: 'stepping-stone', name: 'Stepping stone', w: 20, d: 16, h: 1 },
      { kind: 'boulder', name: 'Boulder', w: 50, d: 40, h: 26 },
      { kind: 'mailbox', name: 'Mailbox', w: 10, d: 14, h: 44 },
    ],
  },
  {
    name: 'Surfaces',
    items: [
      { kind: 'surface-concrete', name: 'Concrete', w: 144, d: 240, h: 1 },
      { kind: 'surface-asphalt', name: 'Asphalt', w: 144, d: 240, h: 1 },
      { kind: 'surface-gravel', name: 'Gravel / rock', w: 144, d: 240, h: 1 },
      { kind: 'surface-pavers', name: 'Pavers', w: 96, d: 192, h: 1 },
      { kind: 'surface-mulch', name: 'Mulch bed', w: 120, d: 60, h: 1 },
    ],
  },
  {
    name: 'Garage',
    items: [
      { kind: 'car', name: 'Car', w: 70, d: 178, h: 56 },
      { kind: 'pickup', name: 'Pickup truck', w: 76, d: 220, h: 72 },
      { kind: 'camper', name: 'Camper trailer', w: 96, d: 260, h: 104 },
      { kind: 'boat-trailer', name: 'Boat + trailer', w: 84, d: 250, h: 88 },
      { kind: 'jet-ski', name: 'Jet ski + trailer', w: 48, d: 130, h: 46 },
      { kind: 'workbench', name: 'Workbench', w: 72, d: 25, h: 38 },
      { kind: 'tool-chest', name: 'Tool chest', w: 42, d: 20, h: 44 },
    ],
  },
]

const byKind = new Map<string, CatalogItem>()
for (const cat of CATALOG) for (const it of cat.items) byKind.set(it.kind, it)

export const catalogItem = (kind: string): CatalogItem =>
  byKind.get(kind) ?? { kind, name: kind, w: 24, d: 24, h: 24 }
