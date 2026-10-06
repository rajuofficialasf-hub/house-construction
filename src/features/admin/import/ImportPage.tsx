import { gn, lt, pick, t } from '@/i18n'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useToast } from '@/components/useToast'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { getHousingApi, HousingApiError, type BulkUpdateInput, type HousingBulkRow, type Project, type ProjectKey } from '@/backend'
import { gnUnion, useUnionData } from '@/features/geo/unions'
import { formatField } from '@/features/projects/fields'
import { ProgressBar } from '@/features/housing/components/ImageUploader'
import { downloadText, toCsv } from '@/features/housing/utils/csvExport'
import { adminPath, useRecordProjects } from '@/features/housing/utils/housingProjects'
import { isMainAdmin, useAdminUser } from '../adminUser'
import { useCategoryUsage } from '../records/useCategoryUsage'
import { CategoryReviewPanel } from './CategoryReviewPanel'
import { GeoFixPanel } from './GeoFixPanel'
import { analyzeRows, CLEAR_TOKEN, fillDown, fillDownFields, type ImportAnalysis, type ImportMode, type ImportRow, type Mapping } from './importAnalyze'
import { buildImportFields, guessMapping, isIgnoredHeader, type ImportFieldDef, type ImportFieldId } from './importFields'
import { parseSpreadsheet, type ParsedSheet } from './importParse'

const BATCH = 200
const PREVIEW_LIMIT = 300

interface RunResult {
  ok: number
  failed: { rowNo: number; serial: number | null; name: string; reason: string }[]
  missing: number[]
}

/**
 * /admin/import?project=<key> — Google Sheet (xlsx/csv) থেকে যেকোনো প্রকল্পে বাল্ক ইম্পোর্ট (M-ধাপ ১১; প্রকল্প রেজিস্ট্রি থেকে), ৪ ধাপ:
 * ১) প্রকল্প, মোড, ফাইল → ২) কলাম ম্যাপিং (প্রকল্পের ফিল্ড থেকে স্বয়ংক্রিয় অনুমান) → ৩) প্রিভিউ: যাচাই, ভৌগোলিক নাম
 * (ইউনিয়নসহ), ক্যাটাগরির বানান (ঐচ্ছিক), ডুপ্লিকেট → ৪) ব্যাচে চালানো (গোপন মান আলাদা) + সারসংক্ষেপ + ব্যর্থ CSV।
 */
export function ImportPage() {
  useDocumentTitle(t('বাল্ক ইম্পোর্ট'))
  const projects = useRecordProjects()
  const [searchParams] = useSearchParams()
  const asked = searchParams.get('project')
  const [chosen, setProjectKey] = useState<ProjectKey | null>(null)
  // URL এর প্রকল্প (খসড়া হলে এডমিনের রেজিস্ট্রিতে একটু পরে আসে) — এলে সেটিই; ব্যবহারকারী বাছলে সেটি
  const projectKey = chosen ?? (projects.some((p) => p.key === asked) ? asked : null) ?? projects[0]?.key
  const project = projects.find((p) => p.key === projectKey) ?? projects[0]
  if (!project) return null
  return <Importer key={project.key} project={project} projects={projects} onProject={setProjectKey} />
}

function Importer({ project, projects, onProject }: { project: Project; projects: Project[]; onProject: (key: ProjectKey) => void }) {
  const toast = useToast()
  const api = getHousingApi()
  const projectType = project.key
  const fields = useMemo(() => buildImportFields(project), [project])
  const byId = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields])
  const [mode, setMode] = useState<ImportMode>('insert')
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Mapping>([])
  const [geoFixes, setGeoFixes] = useState<Record<string, string>>({})
  const [categoryFixes, setCategoryFixes] = useState<Record<string, Record<string, string>>>({})
  const [nextSerial, setNextSerial] = useState<number | null>(null)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [useFillDown, setUseFillDown] = useState(true)
  const [insertMissing, setInsertMissing] = useState(false)
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const existing = useCategoryUsage(project, result ? 1 : 0)
  const unionMapped = mapping.includes('union_name')
  const { data: unions } = useUnionData(project.geo_depth === 'union' && unionMapped)

  // ---- পরবর্তী সিরিয়াল ----
  useEffect(() => {
    let alive = true
    api
      .nextSerial(projectType)
      .then((n) => alive && setNextSerial(n))
      .catch(() => alive && setNextSerial(null))
    return () => {
      alive = false
    }
  }, [api, projectType])

  // ---- ফাইল ----
  const onFile = async (f: File | null) => {
    setFile(f)
    setSheet(null)
    setParseError(null)
    setResult(null)
    setGeoFixes({})
    setCategoryFixes({})
    if (!f) return
    try {
      const parsed = await parseSpreadsheet(f)
      setSheet(parsed)
      setMapping(guessMapping(parsed.headers, fields))
    } catch (err) {
      setParseError(HousingApiError.from(err).message)
    }
  }

  // ---- বিশ্লেষণ ----
  const update = mode === 'update'
  // "(মুছুন)" (মান ফাঁকা করা) শুধু মূল এডমিন — প্রকল্পের ইউজারের সারিতে ভুল (পর্ব চ; ডাটাবেসও আটকায়)
  const canClear = isMainAdmin(useAdminUser())
  const hasSerialCol = mapping.includes('serial_no')
  // খালি সাল/বিভাগ/জেলা/উপজেলা (আর ফিল-ডাউন চালু কাস্টম ফিল্ড) → উপরের সারির মান; আপডেটে নয় (সেখানে খালি = অপরিবর্তিত)
  const fdIds = useMemo(() => fillDownFields(fields), [fields])
  const filled = useMemo(() => (sheet && useFillDown && !update ? fillDown(sheet.rows, mapping, fdIds) : { rows: sheet?.rows ?? [], filled: 0 }), [sheet, mapping, useFillDown, update, fdIds])
  const analysis: ImportAnalysis | null = useMemo(() => {
    if (!sheet) return null
    return analyzeRows(filled.rows, mapping, fields, { mode, geoFixes, serialFromFile: hasSerialCol, startSerial: nextSerial ?? 1, unions, categoryFixes, canClear })
  }, [sheet, filled, mapping, fields, mode, geoFixes, hasSerialCol, nextSerial, unions, categoryFixes, canClear])

  const missingRequired = update ? [] : fields.filter((f) => f.required && !mapping.includes(f.id))
  const modeNeedsSerial = update && !hasSerialCol
  const canRun = !!analysis && analysis.validCount > 0 && missingRequired.length === 0 && !modeNeedsSerial && !running

  const setMap = (i: number, id: ImportFieldId | null) => setMapping((m) => m.map((f, j) => (j === i ? id : f === id && id !== null ? null : f)))
  const fieldLabel = (f: ImportFieldDef) => pick(f.label_bn, f.label_en)
  const mappedCustom = useMemo(() => fields.filter((f) => f.id.startsWith('x.') && mapping.includes(f.id)), [fields, mapping])
  const categoryMapped = useMemo(() => mappedCustom.filter((f) => f.def?.type === 'category' && !f.private), [mappedCustom])
  const photoIds = (['prev_photo_source', 'current_photo_source'] as const).filter((id) => byId.has(id))

  // ---- চালানো ----
  const run = useCallback(async () => {
    if (!analysis) return
    const valid = analysis.rows.filter((r) => !r.errors.length)
    const invalid = analysis.rows.filter((r) => r.errors.length)
    const res: RunResult = {
      ok: 0,
      failed: invalid.map((r) => ({ rowNo: r.rowNo, serial: r.values.serial_no, name: r.values.name, reason: t('বাদ (ভুল): {errors}', { errors: r.errors.join('; ') }) })),
      missing: [],
    }
    const hasCustom = project.fields.some((f) => f.is_active)
    const insertRow = (r: ImportRow): HousingBulkRow => ({
      serial_no: r.values.serial_no ?? undefined,
      year: r.values.year!,
      name: r.values.name,
      father_or_husband_name: r.values.father_or_husband_name,
      division: r.values.division!,
      district: r.values.district!,
      upazila: r.values.upazila!,
      address: r.values.address,
      prev_photo_source: r.values.prev_photo_source,
      current_photo_source: r.values.current_photo_source,
      ...(byId.has('union_name') ? { union_name: r.values.union_name } : {}),
      ...(hasCustom ? { extra: r.extra } : {}),
    })
    /** আপডেট: শুধু ম্যাপ করা আর খালি নয় এমন ঘর; "(মুছুন)" → _clear; গোপন মান extra দিয়ে (ডাটাবেস আলাদা জায়গায় রাখে) */
    const updateRow = (r: ImportRow): BulkUpdateInput['rows'][number] => {
      const p = (id: ImportFieldId) => r.present.has(id)
      const v = r.values
      const extra = { ...r.extra, ...r.priv }
      return {
        serial_no: v.serial_no!,
        ...(p('year') && v.year !== null ? { year: v.year } : {}),
        ...(p('name') ? { name: v.name } : {}),
        ...(p('father_or_husband_name') ? { father_or_husband_name: v.father_or_husband_name } : {}),
        ...(p('division') && v.division ? { division: v.division, district: v.district!, upazila: v.upazila! } : {}),
        ...(p('union_name') ? { union_name: v.union_name } : {}),
        ...(p('address') ? { address: v.address } : {}),
        ...(p('prev_photo_source') ? { prev_photo_source: v.prev_photo_source } : {}),
        ...(p('current_photo_source') ? { current_photo_source: v.current_photo_source } : {}),
        ...(Object.keys(extra).length ? { extra } : {}),
        ...(r.clear.length ? { _clear: r.clear } : {}),
      }
    }
    /** নতুন যোগের পর গোপন মান (সিরিয়াল ধরে; ডাটাবেস beneficiary_private এ রাখে) */
    const sendPrivate = async (inserted: ImportRow[]) => {
      const rows = inserted.filter((r) => Object.keys(r.priv).length && r.values.serial_no !== null).map((r) => ({ serial_no: r.values.serial_no!, extra: r.priv }))
      if (!rows.length) return
      try {
        await api.bulkUpdateBySerial({ project_type: projectType, rows })
      } catch (err) {
        const reason = t('রেকর্ড যোগ হয়েছে, কিন্তু গোপন মান সংরক্ষণ হয়নি: {message}', { message: HousingApiError.from(err).message })
        for (const r of inserted.filter((x) => Object.keys(x.priv).length)) res.failed.push({ rowNo: r.rowNo, serial: r.values.serial_no, name: r.values.name, reason })
      }
    }
    setResult(null)
    setRunning({ done: 0, total: valid.length })
    try {
      for (let start = 0; start < valid.length; start += BATCH) {
        const chunk = valid.slice(start, start + BATCH)
        try {
          if (!update) {
            const out = await api.bulkInsert({ project_type: projectType, mode: 'use_given_serial', rows: chunk.map(insertRow) })
            res.ok += out.inserted
            await sendPrivate(chunk.slice(0, out.inserted))
            if (out.failed.length) {
              // চাঙ্ক-স্তরে ব্যর্থ → চাঙ্কের সব সারি ব্যর্থ (ইনসার্ট হয়নি)
              const reason = out.failed.map((f) => f.error.message).join('; ')
              for (const r of chunk.slice(out.inserted)) res.failed.push({ rowNo: r.rowNo, serial: r.values.serial_no, name: r.values.name, reason })
            }
          } else {
            const out = await api.bulkUpdateBySerial({ project_type: projectType, rows: chunk.map(updateRow) })
            res.ok += out.updated
            res.missing.push(...out.missing)
            if (insertMissing && out.missing.length) {
              const miss = new Set(out.missing)
              const toInsert = chunk.filter((r) => r.values.serial_no !== null && miss.has(r.values.serial_no))
              const ins = await api.bulkInsert({ project_type: projectType, mode: 'use_given_serial', rows: toInsert.map(insertRow) })
              res.ok += ins.inserted
              res.missing = res.missing.filter((s) => !miss.has(s))
              await sendPrivate(toInsert.slice(0, ins.inserted))
              if (ins.failed.length) {
                const reason = ins.failed.map((f) => f.error.message).join('; ')
                for (const r of toInsert.slice(ins.inserted)) res.failed.push({ rowNo: r.rowNo, serial: r.values.serial_no, name: r.values.name, reason })
              }
            }
          }
        } catch (err) {
          const reason = HousingApiError.from(err).message
          for (const r of chunk) res.failed.push({ rowNo: r.rowNo, serial: r.values.serial_no, name: r.values.name, reason })
        }
        setRunning({ done: Math.min(valid.length, start + chunk.length), total: valid.length })
      }
    } finally {
      setRunning(null)
      setResult(res)
      if (res.ok) toast.success(!update ? t('{n} টি সারি যোগ হয়েছে', { n: formatBanglaNumber(res.ok) }) : t('{n} টি সারি আপডেট হয়েছে', { n: formatBanglaNumber(res.ok) }))
      if (res.failed.length) toast.error(t('{n} টি সারি ব্যর্থ/বাদ — নিচে তালিকা', { n: formatBanglaNumber(res.failed.length) }))
      void api.logActivity('import_run', { mode, file: file?.name ?? '', rows: valid.length, [!update ? 'inserted' : 'updated']: res.ok, failed: res.failed.length, missing: res.missing.length }, projectType)
      api.nextSerial(projectType).then(setNextSerial).catch(() => {})
    }
  }, [analysis, api, mode, update, projectType, insertMissing, toast, file, byId, project.fields])

  const downloadFailed = () => {
    if (!result) return
    const rows = result.failed.map((f) => [f.rowNo, f.serial ?? '', f.name, f.reason])
    const missingRows = result.missing.map((s) => ['', s, '', t('সিরিয়াল ধরে রেকর্ড পাওয়া যায়নি (আপডেট হয়নি)')])
    downloadText(`import-failed-${project.slug}.csv`, toCsv([t('ফাইলের সারি'), t('সিরিয়াল'), t('নাম'), t('কারণ')], [...rows, ...missingRows]))
  }

  const previewRows = useMemo(() => {
    if (!analysis) return []
    const src = onlyErrors ? analysis.rows.filter((r) => r.errors.length || r.warnings.length) : analysis.rows
    return src.slice(0, PREVIEW_LIMIT)
  }, [analysis, onlyErrors])
  const sheetValues = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const f of categoryMapped) out[f.id] = (analysis?.rows ?? []).map((r) => r.raw[f.id])
    return out
  }, [analysis, categoryMapped])
  const unionCol = byId.has('union_name') && unionMapped
  const ignoredHeaders = sheet ? sheet.headers.filter(isIgnoredHeader) : []

  return (
    <section className="container-page py-8 sm:py-10">
      <p className="text-sm text-slate-500">
        <Link to={adminPath(projectType)} className="hover:text-brand-700">
          {t('রেকর্ড')}
        </Link>{' '}
        / {t('বাল্ক ইম্পোর্ট')}
      </p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{t('Google Sheet থেকে বাল্ক ইম্পোর্ট')}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {t('Sheet → File → Download → Excel (.xlsx) বা CSV (UTF-8)। ছবির লিঙ্ক শুধু রেফারেন্স হিসেবে সংরক্ষিত হয়; ছবি নিজে আলাদা স্ক্রিপ্ট/বাল্ক পেইজে আপলোড হবে।')}
      </p>

      {/* ---------- ধাপ ১ ---------- */}
      <Step n={1} title={t('প্রকল্প, মোড ও ফাইল')}>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="imp-project">
              {t('প্রকল্প')}
            </label>
            <select id="imp-project" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={projectType} onChange={(e) => onProject(e.target.value)} disabled={!!running}>
              {projects.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.is_published ? lt(p, 'name') : t('{name} (খসড়া)', { name: lt(p, 'name') })}
                </option>
              ))}
            </select>
            {nextSerial !== null && <p className="mt-1 text-xs text-slate-500">{t('পরবর্তী স্বয়ংক্রিয় সিরিয়াল: {n}', { n: toBanglaNumber(nextSerial) })}</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">{t('মোড')}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" checked={mode === 'insert'} onChange={() => setMode('insert')} disabled={!!running} className="accent-brand-700" /> {t('নতুন যোগ করুন')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" checked={mode === 'update'} onChange={() => setMode('update')} disabled={!!running} className="accent-brand-700" /> {t('সিরিয়াল ধরে আপডেট করুন')}
            </label>
            {update && (
              <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={insertMissing} onChange={(e) => setInsertMissing(e.target.checked)} className="accent-brand-700" /> {t('মিলছে না এমন সিরিয়াল নতুন হিসেবে যোগ করুন')}
              </label>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="imp-file">
              {t('ফাইল (.xlsx / .csv)')}
            </label>
            <input id="imp-file" type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} disabled={!!running} />
            {file && sheet && (
              <p className="mt-1 text-xs text-slate-500">
                {file.name} · {t('শীট "{sheet}" · {rows} সারি, {cols} কলাম', { sheet: sheet.sheetName, rows: formatBanglaNumber(sheet.rows.length), cols: toBanglaNumber(sheet.headers.length) })}
              </p>
            )}
            {parseError && (
              <p role="alert" className="mt-1 text-xs text-red-700">
                {parseError}
              </p>
            )}
          </div>
        </div>
        {update && (
          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950" role="note">
            <p className="font-semibold">{t('"সিরিয়াল ধরে আপডেট" এর নিয়ম')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>{t('শুধু সিরিয়াল কলাম আবশ্যক; যে কলাম ম্যাপ করবেন শুধু সেগুলোই বদলাবে।')}</li>
              <li>{t('খালি ঘর = অপরিবর্তিত (আগের মান থাকে)।')}</li>
              <li>
                {canClear
                  ? t('কোনো মান মুছতে ঘরে লিখুন {token} — আবশ্যক ঘর (সাল, নাম, ঠিকানার স্তর, আবশ্যক ফিল্ড) মোছা যায় না।', { token: CLEAR_TOKEN })
                  : t('মান মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন — {token} লিখলে সেই সারি বাদ যাবে।', { token: CLEAR_TOKEN })}
              </li>
            </ul>
          </div>
        )}
      </Step>

      {/* ---------- ধাপ ২ ---------- */}
      {sheet && (
        <Step n={2} title={t('কলাম ম্যাপিং')}>
          <p className="mb-3 text-xs text-slate-500">{t('হেডার দেখে অনুমান বসানো হয়েছে; ভুল হলে বদলান। একই ফিল্ড দুই কলামে বসবে না।')}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sheet.headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800" title={h}>
                    {h}
                  </p>
                  <p className="truncate text-xs text-slate-400" title={sheet.rows[0]?.[i]}>
                    {t('যেমন: {v}', { v: sheet.rows[0]?.[i] || '—' })}
                  </p>
                </div>
                <select className="h-9 w-40 rounded-md border border-slate-300 bg-white px-2 text-xs" value={mapping[i] ?? ''} onChange={(e) => setMap(i, (e.target.value || null) as ImportFieldId | null)} disabled={!!running} aria-label={t('"{h}" কলামের ফিল্ড', { h })}>
                  <option value="">{t('— উপেক্ষা —')}</option>
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.private ? '🔒 ' : ''}
                      {fieldLabel(f)}
                      {!update && f.required ? ' *' : update && f.id === 'serial_no' ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {ignoredHeaders.length > 0 && <p className="mt-2 text-xs text-slate-500">{t('এক্সপোর্টের তথ্য-কলাম উপেক্ষা করা হলো: {list}', { list: ignoredHeaders.join(', ') })}</p>}
          {missingRequired.length > 0 && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {t('আবশ্যক ফিল্ড ম্যাপ হয়নি: {fields}', { fields: missingRequired.map(fieldLabel).join(', ') })}
            </p>
          )}
          {modeNeedsSerial && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {t('"সিরিয়াল ধরে আপডেট" মোডে সিরিয়াল কলাম ম্যাপ করা আবশ্যক।')}
            </p>
          )}
          {!update && (
            <p className="mt-2 text-xs text-slate-600">
              {t('সিরিয়াল: {info}', { info: hasSerialCol ? t('ফাইলের সিরিয়াল কলাম ব্যবহার হবে (সংখ্যা, অনন্য, ফাঁকা নয়)') : t('ফাইলে সিরিয়াল কলাম নেই — সারির ক্রমে {n} থেকে দেওয়া হবে', { n: toBanglaNumber(nextSerial ?? 1) }) })}
            </p>
          )}
          {!update && (
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={useFillDown} onChange={(e) => setUseFillDown(e.target.checked)} disabled={!!running} className="mt-0.5 accent-brand-700" />
              <span>
                {t('খালি')} <strong>{t('সাল / বিভাগ / জেলা / উপজেলা')}</strong> {t('ঘরে উপরের সারির মান ধরুন (শীটে একবার লিখে নিচে খালি রাখলে)')}
                {filled.filled > 0 && <span className="ml-1 text-xs text-slate-500">— {t('{n} টি ঘর ভরা হয়েছে', { n: formatBanglaNumber(filled.filled) })}</span>}
              </span>
            </label>
          )}
        </Step>
      )}

      {/* ---------- ধাপ ৩ ---------- */}
      {analysis && (
        <Step n={3} title={t('প্রিভিউ ও যাচাই')}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge className="bg-slate-100 text-slate-800">{t('মোট {n}', { n: formatBanglaNumber(analysis.rows.length) })}</Badge>
            <Badge className="bg-green-100 text-green-800">{t('ঠিক আছে {n}', { n: formatBanglaNumber(analysis.validCount) })}</Badge>
            {analysis.errorCount > 0 && <Badge className="bg-red-100 text-red-800">{t('ভুল {n} (বাদ যাবে)', { n: formatBanglaNumber(analysis.errorCount) })}</Badge>}
            {analysis.warningCount > 0 && <Badge className="bg-amber-100 text-amber-800">{t('সতর্কতা {n}', { n: formatBanglaNumber(analysis.warningCount) })}</Badge>}
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="accent-brand-700" /> {t('শুধু ভুল/সতর্কতার সারি')}
            </label>
          </div>

          {analysis.unresolvedGeo.length > 0 && <GeoFixPanel items={analysis.unresolvedGeo} rows={analysis.rows} fixes={geoFixes} unions={unions} onFix={(key, value) => setGeoFixes((f) => ({ ...f, [key]: value }))} />}
          {categoryMapped.length > 0 && (
            <CategoryReviewPanel
              fields={categoryMapped}
              sheetValues={sheetValues}
              existing={existing}
              fixes={categoryFixes}
              onChange={(key, from, to) =>
                setCategoryFixes((all) => {
                  const cur = { ...(all[key] ?? {}) }
                  if (to) cur[from] = to
                  else delete cur[from]
                  return { ...all, [key]: cur }
                })
              }
            />
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[1100px] text-xs">
              <thead className="bg-slate-50 text-left font-semibold text-slate-600">
                <tr>
                  <th className="px-2 py-2">{t('সারি')}</th>
                  <th className="px-2 py-2">{t('সিরিয়াল')}</th>
                  <th className="px-2 py-2">{t('সাল')}</th>
                  <th className="px-2 py-2">{t('নাম')}</th>
                  <th className="px-2 py-2">{t('পিতা/স্বামী')}</th>
                  <th className="px-2 py-2">{t('বিভাগ')}</th>
                  <th className="px-2 py-2">{t('জেলা')}</th>
                  <th className="px-2 py-2">{t('উপজেলা')}</th>
                  {unionCol && <th className="px-2 py-2">{t('ইউনিয়ন')}</th>}
                  <th className="px-2 py-2">{t('ঠিকানা')}</th>
                  {mappedCustom.map((f) => (
                    <th key={f.id} className="px-2 py-2">
                      {f.private ? '🔒 ' : ''}
                      {fieldLabel(f)}
                    </th>
                  ))}
                  {photoIds.length > 0 && <th className="px-2 py-2">{t('ছবি লিঙ্ক')}</th>}
                  <th className="px-2 py-2">{t('অবস্থা')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((r) => (
                  <tr key={r.rowNo} className={r.errors.length ? 'bg-red-50' : r.warnings.length ? 'bg-amber-50/60' : ''}>
                    <td className="px-2 py-1.5 text-slate-500">{toBanglaNumber(r.rowNo)}</td>
                    <td className="px-2 py-1.5 font-medium tabular-nums">{r.values.serial_no !== null ? toBanglaNumber(r.values.serial_no) : <Bad>{r.raw.serial_no || '—'}</Bad>}</td>
                    <td className="px-2 py-1.5">{r.values.year !== null ? toBanglaNumber(r.values.year) : update && !r.raw.year ? '—' : <Bad>{r.raw.year || '—'}</Bad>}</td>
                    <td className="px-2 py-1.5">{r.values.name || (update ? '—' : <Bad>—</Bad>)}</td>
                    <td className="px-2 py-1.5">{r.clear.includes('father_or_husband_name') ? <Cleared /> : r.values.father_or_husband_name || '—'}</td>
                    <GeoCell value={r.values.division} raw={r.raw.division} corrected={r.geo.corrected.includes('division')} soft={update} />
                    <GeoCell value={r.values.district} raw={r.raw.district} corrected={r.geo.corrected.includes('district')} soft={update} />
                    <GeoCell value={r.values.upazila} raw={r.raw.upazila} corrected={r.geo.corrected.includes('upazila')} soft={update} />
                    {unionCol && (
                      <td className="px-2 py-1.5">
                        {r.clear.includes('union_name') ? <Cleared /> : r.values.union_name ? gnUnion(r.values.district, r.values.upazila, r.values.union_name) : '—'}
                        {r.geo.union?.status === 'unlisted' && r.values.union_name === r.geo.union.value && <span className="ml-1 text-[10px] text-yellow-700">{t('(তালিকায় নেই)')}</span>}
                      </td>
                    )}
                    <td className="max-w-[12rem] truncate px-2 py-1.5 text-slate-600" title={r.values.address}>
                      {r.clear.includes('address') ? <Cleared /> : r.values.address || '—'}
                    </td>
                    {mappedCustom.map((f) => {
                      const key = f.id.slice(2)
                      const v = (f.private ? r.priv : r.extra)[key]
                      return (
                        <td key={f.id} className={`px-2 py-1.5 ${f.def?.type === 'money' || f.def?.type === 'number' ? 'text-right whitespace-nowrap tabular-nums' : ''}`}>
                          {r.bad.has(f.id) ? <Bad>{r.raw[f.id] || '—'}</Bad> : r.clear.includes(`extra.${key}`) ? <Cleared /> : v !== undefined ? formatField(f.def!, v) : '—'}
                        </td>
                      )
                    })}
                    {photoIds.length > 0 && <td className="px-2 py-1.5 text-slate-500">{photoIds.map((id) => (r.clear.includes(id) ? '✕' : r.values[id] ? '✓' : '–')).join(' / ')}</td>}
                    <td className="max-w-[18rem] px-2 py-1.5">
                      {r.errors.map((e, i) => (
                        <p key={`e${i}`} className="text-red-700">
                          {e}
                        </p>
                      ))}
                      {r.warnings.map((w, i) => (
                        <p key={`w${i}`} className="text-amber-800">
                          {w}
                        </p>
                      ))}
                      {!r.errors.length && !r.warnings.length && <span className="text-green-700">{t('ঠিক আছে')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewRows.length >= PREVIEW_LIMIT && <p className="px-3 py-2 text-xs text-slate-500">{t('প্রথম {n} টি সারি দেখানো হচ্ছে।', { n: formatBanglaNumber(PREVIEW_LIMIT) })}</p>}
          </div>
        </Step>
      )}

      {/* ---------- ধাপ ৪ ---------- */}
      {analysis && (
        <Step n={4} title={t('ইম্পোর্ট চালান')}>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!canRun} onClick={() => void run()} className="inline-flex h-11 items-center rounded-md bg-brand-700 px-6 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
              {!update ? t('{n} টি সারি যোগ করুন', { n: formatBanglaNumber(analysis.validCount) }) : t('{n} টি সারি আপডেট করুন', { n: formatBanglaNumber(analysis.validCount) })}
            </button>
            {analysis.errorCount > 0 && <span className="text-sm text-red-700">{t('{n} টি ভুল সারি বাদ যাবে (ব্যর্থ তালিকায় থাকবে)', { n: formatBanglaNumber(analysis.errorCount) })}</span>}
          </div>
          {running && (
            <div className="mt-4">
              <p className="text-sm text-slate-700">
                {t('চলছে… {done} / {total} (ব্যাচ {batch} করে)', { done: formatBanglaNumber(running.done), total: formatBanglaNumber(running.total), batch: toBanglaNumber(BATCH) })}
              </p>
              <ProgressBar value={(running.done / Math.max(1, running.total)) * 100} label={t('ইম্পোর্ট অগ্রগতি')} />
            </div>
          )}
          {result && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm" role="status">
              <p className="font-semibold text-slate-900">{t('সারসংক্ষেপ')}</p>
              <ul className="mt-2 space-y-1">
                <li className="text-green-700">{t('সফল: {n}', { n: formatBanglaNumber(result.ok) })}</li>
                <li className="text-red-700">{t('ব্যর্থ/বাদ: {n}', { n: formatBanglaNumber(result.failed.length) })}</li>
                {update && <li className="text-amber-800">{t('সিরিয়াল মিলেনি (আপডেট হয়নি): {n}', { n: formatBanglaNumber(result.missing.length) })}</li>}
              </ul>
              {(result.failed.length > 0 || result.missing.length > 0) && (
                <>
                  <button type="button" onClick={downloadFailed} className="mt-3 inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    {t('ব্যর্থদের তালিকা CSV ডাউনলোড')}
                  </button>
                  <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-slate-600">
                    {result.failed.slice(0, 20).map((f, i) => (
                      <li key={i}>
                        {t('সারি {row}', { row: toBanglaNumber(f.rowNo) })} {f.serial ? t('(সিরিয়াল {s})', { s: toBanglaNumber(f.serial) }) : ''}: {f.reason}
                      </li>
                    ))}
                    {result.missing.slice(0, 20).map((s) => (
                      <li key={`m${s}`}>{t('সিরিয়াল {s}: রেকর্ড নেই', { s: toBanglaNumber(s) })}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-3 text-xs text-slate-500">
                {t('সিস্টেমে দেওয়া সিরিয়াল Google Sheet এ ফেরাতে রেকর্ড পেইজের "সিরিয়াল সহ এক্সপোর্ট" ব্যবহার করুন।')}
              </p>
            </div>
          )}
        </Step>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- ছোট কম্পোনেন্ট
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{toBanglaNumber(n)}</span>
        {title}
      </h2>
      {children}
    </div>
  )
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

function Bad({ children }: { children: ReactNode }) {
  return <span className="rounded bg-red-100 px-1 text-red-800">{children}</span>
}

function Cleared() {
  return <span className="rounded bg-slate-200 px-1 text-slate-700">{t('(মুছে যাবে)')}</span>
}

function GeoCell({ value, raw, corrected, soft = false }: { value: string | null; raw: string; corrected: boolean; soft?: boolean }) {
  if (!value) {
    return <td className="px-2 py-1.5">{soft && !raw ? '—' : <Bad>{raw || '—'}</Bad>}</td>
  }
  return (
    <td className="px-2 py-1.5" title={corrected ? t('ফাইলে: "{raw}"', { raw }) : undefined}>
      {gn(value)}
      {corrected && <span className="ml-1 text-[10px] text-amber-700">{t('(সংশোধিত)')}</span>}
    </td>
  )
}
