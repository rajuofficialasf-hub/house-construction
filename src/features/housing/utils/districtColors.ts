/**
 * মানচিত্রে জেলাভেদে আলাদা রঙ। যেসব জেলায় কাজ হয়েছে সেগুলো মোট সংখ্যা অনুযায়ী সাজিয়ে
 * প্যালেট থেকে রঙ পায় (বেশি কাজের জেলা আগে → স্পষ্ট রঙ)। ১৪টির বেশি জেলা হলে HSL ঘুরিয়ে নতুন রঙ।
 */
const PALETTE = [
  '#2563eb', // নীল
  '#dc2626', // লাল
  '#059669', // সবুজ
  '#d97706', // কমলা-হলুদ
  '#7c3aed', // বেগুনি
  '#db2777', // গোলাপি
  '#0891b2', // সায়ান
  '#65a30d', // লাইম
  '#ea580c', // কমলা
  '#4f46e5', // ইন্ডিগো
  '#0d9488', // টিল
  '#b45309', // বাদামি
  '#9333ea', // ভায়োলেট
  '#be123c', // ক্রিমসন
]

export interface DistrictColor {
  district: string
  color: string
  total: number
  upazilas: number
}

/** counts: "জেলা|উপজেলা" → n  ⇒  জেলা → রঙ (মোট সংখ্যা অনুযায়ী ক্রম) */
export function districtColors(counts: Record<string, number>): { byDistrict: Map<string, DistrictColor>; list: DistrictColor[] } {
  const agg = new Map<string, { total: number; upazilas: number }>()
  for (const [key, n] of Object.entries(counts)) {
    const district = key.split('|')[0]
    if (!district || !n) continue
    const cur = agg.get(district) ?? { total: 0, upazilas: 0 }
    cur.total += n
    cur.upazilas += 1
    agg.set(district, cur)
  }
  const list = [...agg.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'bn'))
    .map(([district, v], i) => ({
      district,
      total: v.total,
      upazilas: v.upazilas,
      color: i < PALETTE.length ? PALETTE[i] : `hsl(${(i * 47) % 360} 65% 42%)`,
    }))
  return { byDistrict: new Map(list.map((d) => [d.district, d])), list }
}

/** hex/hsl রঙে স্বচ্ছতা যোগ (উপজেলার হালকা fill এর জন্য) */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  if (color.startsWith('hsl(')) return color.replace(')', ` / ${alpha})`)
  return color
}
