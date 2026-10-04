import type { Feature, FeatureCollection, MultiLineString, Polygon, MultiPolygon } from 'geojson'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { t } from '@/i18n'
import { HousingApiError } from '../backend/interfaces/types'

/** public/geo/bd-upazilas.json এর প্রতিটি উপজেলার properties (scripts/build-map.mjs) */
export interface UpazilaProps {
  id: string
  /** বাংলা নাম (NFC), ডাটাবেসের মানের সাথে সরাসরি মেলে; না-মেলা (সিটি থানা) হলে null */
  dv: string | null
  ds: string | null
  up: string | null
  /** GADM ইংরেজি নাম */
  en: string
}

export type UpazilaFeature = Feature<Polygon | MultiPolygon, UpazilaProps>

export interface MapData {
  features: FeatureCollection<Polygon | MultiPolygon, UpazilaProps>
  /** জেলার সীমানা (দুই পাশে ভিন্ন জেলা) */
  districtBorders: MultiLineString
  /** বিভাগের সীমানা */
  divisionBorders: MultiLineString
  /** দেশের বাইরের সীমানা */
  outline: MultiLineString
}

export const MAP_URL = '/geo/bd-upazilas.json'

let cache: Promise<MapData> | null = null

/** TopoJSON একবার নামিয়ে (~২৬০ KB) GeoJSON + সীমানা mesh তৈরি; module-level cache */
export function loadMapData(): Promise<MapData> {
  if (cache) return cache
  cache = (async () => {
    let topo: Topology
    try {
      const res = await fetch(MAP_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      topo = (await res.json()) as Topology
    } catch (err) {
      cache = null
      throw new HousingApiError('NETWORK_ERROR', t('মানচিত্রের ডাটা লোড হয়নি: {error}', { error: err instanceof Error ? err.message : String(err) }))
    }
    const objectName = Object.keys(topo.objects)[0]
    const obj = topo.objects[objectName] as GeometryCollection<UpazilaProps>
    const features = feature(topo, obj) as FeatureCollection<Polygon | MultiPolygon, UpazilaProps>
    const props = (g: { properties?: unknown }) => (g.properties ?? {}) as Partial<UpazilaProps>
    const districtBorders = mesh(topo, obj, (a, b) => a !== b && (props(a).ds ?? a.id) !== (props(b).ds ?? b.id))
    const divisionBorders = mesh(topo, obj, (a, b) => a !== b && (props(a).dv ?? '') !== (props(b).dv ?? ''))
    const outline = mesh(topo, obj, (a, b) => a === b)
    return { features, districtBorders, divisionBorders, outline }
  })()
  return cache
}

/** stats.by_location এর key */
export function locationKey(district: string, upazila: string): string {
  return `${district}|${upazila}`
}
