import { t as tr, gn } from '@/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { HousingApiError } from '../backend/interfaces/types'
import { districtColors, withAlpha } from '../utils/districtColors'
import { loadMapData, locationKey, type MapData, type UpazilaFeature } from '../utils/mapData'
import { ErrorNotice } from './ErrorNotice'

export interface MapSelection {
  division: string
  district: string
  upazila: string
}

interface Props {
  /** stats.by_location: "জেলা|উপজেলা" → সংখ্যা */
  counts: Record<string, number>
  /** বর্তমান ফিল্টারের উপজেলা (হাইলাইট) */
  selected?: { district: string; upazila: string } | null
  onSelect: (sel: MapSelection | null) => void
  className?: string
}

const W = 600
const H = 760
const MIN_Z = 1
const MAX_Z = 8
const NO_DATA_FILL = '#f1f5f9'

interface Transform {
  k: number
  x: number
  y: number
}
const IDENTITY: Transform = { k: 1, x: 0, y: 0 }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function clampT(t: Transform): Transform {
  const k = clamp(t.k, MIN_Z, MAX_Z)
  const maxX = (k - 1) * W
  const maxY = (k - 1) * H
  return { k, x: clamp(t.x, -maxX, 0), y: clamp(t.y, -maxY, 0) }
}
/** SVG স্থানাঙ্ক p স্থির রেখে factor গুণ জুম */
function zoomAt(t: Transform, p: { x: number; y: number }, factor: number): Transform {
  const k = clamp(t.k * factor, MIN_Z, MAX_Z)
  const r = k / t.k
  return clampT({ k, x: p.x - (p.x - t.x) * r, y: p.y - (p.y - t.y) * r })
}

/**
 * বাংলাদেশের উপজেলা মানচিত্র (SVG, d3-geo)। যেসব উপজেলায় ঘর হয়েছে সেখানে **পতাকা** + সংখ্যা; পতাকা ও উপজেলার
 * হালকা fill **জেলাভেদে আলাদা রঙ**। hover এ টুলটিপ; ক্লিকে onSelect (আবার ক্লিকে বাতিল)। হুইল/পিঞ্চ জুম, ড্র্যাগ প্যান,
 * +/−/রিসেট। টাইল-ম্যাপ নেই — পরিষ্কার।
 */
export function UpazilaMap({ counts, selected, onSelect, className = '' }: Props) {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<HousingApiError | null>(null)
  const [t, setT] = useState<Transform>(IDENTITY)
  const [hover, setHover] = useState<{ f: UpazilaFeature; x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  useEffect(() => {
    let alive = true
    loadMapData()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setError(HousingApiError.from(e)))
    return () => {
      alive = false
    }
  }, [])

  const palette = useMemo(() => districtColors(counts), [counts])

  const geo = useMemo(() => {
    if (!data) return null
    const projection = geoMercator().fitExtent(
      [
        [8, 8],
        [W - 8, H - 8],
      ],
      data.features,
    )
    const path = geoPath(projection)
    const items = data.features.features.map((f) => {
      const key = f.properties.ds && f.properties.up ? locationKey(f.properties.ds, f.properties.up) : null
      const count = key ? (counts[key] ?? 0) : 0
      const [cx, cy] = count > 0 ? path.centroid(f) : [0, 0]
      const color = count > 0 && f.properties.ds ? (palette.byDistrict.get(f.properties.ds)?.color ?? '#1d6340') : null
      return { f, d: path(f) ?? '', count, cx, cy, color }
    })
    return {
      items,
      byId: new Map(items.map((i) => [i.f.properties.id, i])),
      flagged: items.filter((i) => i.count > 0).sort((a, b) => a.cy - b.cy), // উপর থেকে নিচে আঁকা → নিচের পতাকা উপরে থাকে
      district: path(data.districtBorders) ?? '',
      division: path(data.divisionBorders) ?? '',
      outline: path(data.outline) ?? '',
      withData: items.filter((i) => i.count > 0).length,
      total: items.reduce((s, i) => s + i.count, 0),
    }
  }, [data, counts, palette])

  // ---- জেসচার (native listeners: wheel passive:false, pointer capture) ----
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const toSvg = (cx: number, cy: number) => {
      const r = svg.getBoundingClientRect()
      return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H }
    }
    const pointers = new Map<number, { x: number; y: number }>()
    let pan: { x: number; y: number; tx: number; ty: number } | null = null
    let pinch: { dist: number; k: number; mid: { x: number; y: number }; tx: number; ty: number } | null = null
    let moved = false
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      // এখানে pointer capture নেওয়া হয় না: নিলে click ইভেন্ট <path> এ না গিয়ে SVG এ যায় (ক্লিক-ফিল্টার ভেঙে যায়)।
      // ক্যাপচার শুধু ড্র্যাগ শুরু হলে (onMove) — তখন ক্লিক দরকার নেই।
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      moved = false
      if (pointers.size === 1) pan = { x: e.clientX, y: e.clientY, tx: tRef.current.x, ty: tRef.current.y }
      else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pan = null
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: tRef.current.k, mid: toSvg((a.x + b.x) / 2, (a.y + b.y) / 2), tx: tRef.current.x, ty: tRef.current.y }
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const factor = Math.hypot(a.x - b.x, a.y - b.y) / (pinch.dist || 1)
        setT(zoomAt({ k: pinch.k, x: pinch.tx, y: pinch.ty }, pinch.mid, factor))
        moved = true
        return
      }
      if (pan) {
        const r = svg.getBoundingClientRect()
        const dx = ((e.clientX - pan.x) / r.width) * W
        const dy = ((e.clientY - pan.y) / r.height) * H
        if (!moved && Math.abs(dx) + Math.abs(dy) > 2) {
          moved = true
          // ড্র্যাগ শুরু: এখন ক্যাপচার নিলে SVG এর বাইরে গেলেও প্যান চলতে থাকে
          try {
            svg.setPointerCapture(e.pointerId)
          } catch {
            /* কিছু ব্রাউজারে pointer আর সক্রিয় না থাকলে throw করে — উপেক্ষা */
          }
        }
        if (moved) {
          // মান এখনই নিন: setT এর updater পরে (রেন্ডারে) চলে — ততক্ষণে pointerup এ pan = null হতে পারে
          // (মোবাইলে দ্রুত ট্যাপ/ড্র্যাগে "Cannot read properties of null (reading 'tx')" হতো)
          const nx = pan.tx + dx
          const ny = pan.ty + dy
          setT((cur) => clampT({ k: cur.k, x: nx, y: ny }))
        }
      }
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size === 0) pan = null
      // ড্র্যাগ হলে ক্লিক গোনা হবে না
      if (moved) svg.dataset.dragged = '1'
      else delete svg.dataset.dragged
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setT((cur) => zoomAt(cur, toSvg(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0018)))
    }
    svg.addEventListener('pointerdown', onDown)
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
    svg.addEventListener('pointercancel', onUp)
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      svg.removeEventListener('pointerdown', onDown)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onUp)
      svg.removeEventListener('wheel', onWheel)
    }
  }, [])

  const isSelected = (f: UpazilaFeature) => !!selected && f.properties.ds === selected.district && f.properties.up === selected.upazila
  const click = (f: UpazilaFeature) => {
    if (svgRef.current?.dataset.dragged) return
    const p = f.properties
    if (!p.dv || !p.ds || !p.up) return
    if (isSelected(f)) onSelect(null)
    else onSelect({ division: p.dv, district: p.ds, upazila: p.up })
  }
  const zoomBtn = (factor: number) => setT((cur) => zoomAt(cur, { x: W / 2, y: H / 2 }, factor))
  // টাচে hover-টুলটিপ নেই (আঙুলের নিচে ঢাকা পড়ে, আর প্রতিটি ট্যাপে পুনরায় রেন্ডার বাঁচে); ট্যাপেই ফিল্টার হয়
  const setHoverFrom = (f: UpazilaFeature, e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    setHover({ f, x: e.clientX, y: e.clientY })
  }
  const hoverProps = (f: UpazilaFeature) => ({
    onPointerEnter: (e: React.PointerEvent) => setHoverFrom(f, e),
    onPointerMove: (e: React.PointerEvent) => setHoverFrom(f, e),
  })
  // বেস-লেয়ারের <path> গুলোয় আলাদা হ্যান্ডলার নেই — <g> এ একটিই (data-id দিয়ে উপজেলা চেনা)
  const featureFromEvent = useCallback(
    (e: React.SyntheticEvent): UpazilaFeature | null => {
      const id = (e.target as Element | null)?.getAttribute?.('data-id')
      return id && geo ? (geo.byId.get(id)?.f ?? null) : null
    },
    [geo],
  )
  /**
   * বেস-লেয়ার: ৫৪৫ উপজেলা path — শুধু data/counts বদলালে নতুন করে তৈরি হয়; hover/selected/zoom এ নয়।
   * (আগে প্রতিটি ট্যাপ/জুমে সব path পুনরায় রেন্ডার হতো — মোবাইল ব্রাউজারে ভারী; কিছু ফোনে পেইজ সাদা হয়ে যেত।)
   * stroke প্রস্থ zoom-নিরপেক্ষ: vector-effect="non-scaling-stroke"।
   */
  const baseLayer = useMemo(() => {
    if (!geo) return null
    return (
      <g>
        {geo.items.map(({ f, d, count, color }) => (
          <path
            key={f.properties.id}
            data-id={f.properties.id}
            d={d}
            fill={color ? withAlpha(color, 0.32) : NO_DATA_FILL}
            stroke="#ffffff"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
            className={count > 0 ? 'cursor-pointer' : ''}
          />
        ))}
        <path d={geo.district} fill="none" stroke="#94a3b8" strokeWidth={0.7} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <path d={geo.division} fill="none" stroke="#475569" strokeWidth={1.1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <path d={geo.outline} fill="none" stroke="#334155" strokeWidth={1.2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      </g>
    )
  }, [geo])

  if (error) return <ErrorNotice title={tr('মানচিত্র লোড করা যায়নি')} error={error} />

  const s = 1 / Math.sqrt(t.k) // জুমে পতাকা/লেখা অনুপাতে ছোট হয়, কিন্তু পুরোপুরি নয়

  return (
    <div className={className}>
      <div className="relative">
        {/* টুলবার */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          <MapButton label={tr('বড় করুন')} onClick={() => zoomBtn(1.4)} disabled={t.k >= MAX_Z}>
            +
          </MapButton>
          <MapButton label={tr('ছোট করুন')} onClick={() => zoomBtn(1 / 1.4)} disabled={t.k <= MIN_Z}>
            −
          </MapButton>
          <MapButton label={tr('রিসেট')} onClick={() => setT(IDENTITY)} disabled={t.k === 1}>
            ⟲
          </MapButton>
        </div>

        {geo && (
          <div className="absolute bottom-2 left-2 z-10 rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-700 shadow-sm ring-1 ring-slate-200">
            <span className="font-medium">
              {tr('{d} জেলার {u} উপজেলায় {n} টি ঘর', { d: formatBanglaNumber(palette.list.length), u: formatBanglaNumber(geo.withData), n: formatBanglaNumber(geo.total) })}
            </span>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={tr('উপজেলা মানচিত্র — যেখানে ঘর হয়েছে সেখানে জেলার রঙের পতাকা ও সংখ্যা; ক্লিক করলে ফিল্টার')}
          className={`block h-auto w-full max-h-[70vh] rounded-xl bg-slate-50 select-none ${t.k > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
          style={{ touchAction: 'none' }}
          onPointerLeave={() => setHover(null)}
        >
          {!geo && (
            <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-slate-400 text-[20px]">
              {tr('মানচিত্র লোড হচ্ছে…')}
            </text>
          )}
          {geo && (
            <g
              transform={`translate(${t.x} ${t.y}) scale(${t.k})`}
              onClick={(e) => {
                const f = featureFromEvent(e)
                if (f) click(f)
              }}
              onPointerOver={(e) => {
                const f = featureFromEvent(e)
                if (f) setHoverFrom(f, e)
              }}
              onPointerMove={(e) => {
                if (e.pointerType === 'touch' || !hover) return
                const f = featureFromEvent(e)
                if (f) setHover({ f, x: e.clientX, y: e.clientY })
              }}
            >
              {/* উপজেলা (স্থির বেস-লেয়ার): কাজ হওয়া → জেলার রঙের হালকা fill; সীমানা */}
              {baseLayer}
              {/* হাইলাইট: শুধু নির্বাচিত ও hover করা উপজেলা — উপরে আলাদা path */}
              {[hover?.f, selected ? geo.items.find((i) => isSelected(i.f))?.f : undefined]
                .filter((f, i, arr): f is UpazilaFeature => !!f && arr.indexOf(f) === i)
                .map((f) => {
                  const it = geo.byId.get(f.properties.id)
                  if (!it) return null
                  const sel = isSelected(f)
                  return (
                    <path
                      key={`hl-${f.properties.id}`}
                      d={it.d}
                      fill={it.color ? withAlpha(it.color, 0.55) : 'rgba(148,163,184,0.25)'}
                      stroke={sel ? '#0f172a' : (it.color ?? '#1d6340')}
                      strokeWidth={sel ? 2 : 1.4}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )
                })}
              {/* পতাকা + সংখ্যা */}
              {geo.flagged.map(({ f, count, cx, cy, color }) => (
                <Flag key={`flag-${f.properties.id}`} x={cx} y={cy} color={color ?? '#1d6340'} count={count} scale={s} selected={isSelected(f)} onClick={() => click(f)} {...hoverProps(f)} />
              ))}
            </g>
          )}
        </svg>

        {hover && <Tooltip hover={hover} count={hover.f.properties.ds && hover.f.properties.up ? (counts[locationKey(hover.f.properties.ds, hover.f.properties.up)] ?? 0) : 0} color={hover.f.properties.ds ? palette.byDistrict.get(hover.f.properties.ds)?.color : undefined} />}
      </div>
    </div>
  )
}

/** পতাকা: খুঁটি + রঙিন পতাকা; পাশে সাদা পিলে সংখ্যা। খুঁটির গোড়া উপজেলার কেন্দ্রে। */
function Flag({
  x,
  y,
  color,
  count,
  scale,
  selected,
  onClick,
  onPointerEnter,
  onPointerMove,
}: {
  x: number
  y: number
  color: string
  count: number
  scale: number
  selected: boolean
  onClick: () => void
  onPointerEnter: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
}) {
  const label = toBanglaNumber(count)
  const pillW = 7 + label.length * 5.2
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="cursor-pointer" onClick={onClick} onPointerEnter={onPointerEnter} onPointerMove={onPointerMove}>
      {/* গোড়ার ছায়া-বিন্দু */}
      <ellipse cx={0} cy={0} rx={3} ry={1.4} fill="rgba(15,23,42,0.35)" />
      {/* খুঁটি */}
      <line x1={0} y1={0} x2={0} y2={-20} stroke="#1e293b" strokeWidth={1.4} strokeLinecap="round" />
      {/* পতাকা */}
      <path d="M0 -20 h12 l-3.2 4 3.2 4 h-12 z" fill={color} stroke={selected ? '#0f172a' : '#ffffff'} strokeWidth={selected ? 1.4 : 0.8} strokeLinejoin="round" />
      {/* সংখ্যার পিল */}
      <g transform="translate(1.5 -8)">
        <rect x={0} y={0} width={pillW} height={9} rx={4.5} fill="#ffffff" stroke={color} strokeWidth={0.9} />
        <text x={pillW / 2} y={4.6} textAnchor="middle" dominantBaseline="central" fontSize={6.5} fontWeight={700} fill="#0f172a" pointerEvents="none">
          {label}
        </text>
      </g>
    </g>
  )
}


function Tooltip({ hover, count, color }: { hover: { f: UpazilaFeature; x: number; y: number }; count: number; color?: string }) {
  const p = hover.f.properties
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const parent = ref.current?.offsetParent as HTMLElement | null
    if (!parent) return
    const r = parent.getBoundingClientRect()
    setPos({ left: clamp(hover.x - r.left + 12, 0, r.width - 200), top: clamp(hover.y - r.top + 12, 0, r.height - 80) })
  }, [hover.x, hover.y])
  return (
    <div ref={ref} role="tooltip" className="pointer-events-none absolute z-20 w-48 rounded-lg bg-slate-900/95 px-3 py-2 text-xs text-white shadow-lg" style={pos ?? { left: 0, top: 0, visibility: 'hidden' }}>
      <p className="flex items-center gap-1.5 font-semibold">
        {color && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />}
        {p.up ? gn(p.up) : p.en}
      </p>
      <p className="text-slate-300">
        {p.ds ? gn(p.ds) : '—'}
        {p.dv ? `, ${gn(p.dv)}` : ''}
      </p>
      <p className="mt-1">
        {count > 0 ? (
          <>
            <span className="font-bold text-green-300">{formatBanglaNumber(count)}</span> {tr('টি ঘর · ক্লিক করে তালিকা দেখুন')}
          </>
        ) : p.up ? (
          tr('এখনো কাজ হয়নি')
        ) : (
          tr('সিটি এলাকা (তালিকায় নেই)')
        )}
      </p>
    </div>
  )
}

function MapButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white text-lg font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:text-brand-700 disabled:opacity-40 sm:h-8 sm:w-8 sm:text-base"
    >
      {children}
    </button>
  )
}

