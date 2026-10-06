/**
 * শুধু dev: GeoSelect + UnionCombobox এর পরীক্ষার পাতা (M-ধাপ ৯) — http://localhost:5173/src/dev/geo-demo.html
 * প্রোডাকশন বিল্ডে নেই (index.html থেকে import হয় না)। রেকর্ড-ফর্মে বসবে M-ধাপ ১০-এ।
 * scripts/geo-check.mjs এই পাতা ব্রাউজারে খুলে পরীক্ষা করে। কোনো ডাটাবেস-কল নেই।
 */
import { useState } from 'react'
import { GeoSelect, type GeoValue } from '@/features/geo/GeoSelect'
import { resolveGeo } from '@/features/geo/geoMatch'
import { gnUnion, useUnionData } from '@/features/geo/unions'
import { LanguageToggle } from '@/i18n'

export function GeoDemo() {
  const [value, setValue] = useState<GeoValue>({ division: '', district: '', upazila: '', union_name: '' })
  // false: এখানে নামানো শুরু নয় — উপজেলা বাছলে কম্বোবক্স নামায় (lazy পরীক্ষা)
  const { data } = useUnionData(false)
  const resolved = resolveGeo(value.division, value.district, value.upazila, {}, { union: value.union_name, unions: data })
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold">GeoSelect · UnionCombobox (dev)</h1>
        <LanguageToggle />
      </div>
      <form className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <GeoSelect value={value} onChange={setValue} union />
      </form>
      <pre data-testid="state" className="mt-4 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
        {JSON.stringify({ value, shown: gnUnion(value.district, value.upazila, value.union_name), union: resolved.union, loaded: !!data }, null, 2)}
      </pre>
    </main>
  )
}
