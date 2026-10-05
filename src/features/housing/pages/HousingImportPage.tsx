import { gn, lt, t } from '@/i18n'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useToast } from '@/components/useToast'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import { getHousingApi } from '../../../backend/factory'
import { HousingApiError, type HousingBulkRow, type ProjectType } from '../../../backend/interfaces/types'
import { ProgressBar } from '../components/ImageUploader'
import { downloadText, toCsv } from '../utils/csvExport'
import { candidatesFor, geoFixKey } from '../utils/geoMatch'
import { FIELD_LABEL, guessMapping, IMPORT_FIELDS, REQUIRED_FIELDS, type ImportField } from '../utils/importColumns'
import { parseSpreadsheet, type ParsedSheet } from '../utils/importParse'
import { analyzeRows, fillDown, type ImportAnalysis, type ImportRow, type Mapping } from '../utils/importValidate'
import { adminPath, useHousingProjects } from '../utils/housingProjects'

type Mode = 'insert' | 'update'
const BATCH = 200
const PREVIEW_LIMIT = 300

interface RunResult {
  ok: number
  failed: { rowNo: number; serial: number | null; name: string; reason: string }[]
  missing: number[]
}

/**
 * /housing/admin/import — Google Sheet (xlsx/csv) থেকে বাল্ক ইম্পোর্ট, ৪ ধাপ:
 * ১) প্রকল্প, মোড, ফাইল → ২) কলাম ম্যাপিং (স্বয়ংক্রিয় অনুমান) → ৩) প্রিভিউ: ভ্যালিডেশন, ভৌগোলিক নাম ঠিক করা, ডুপ্লিকেট → ৪) ব্যাচে চালানো + সারসংক্ষেপ + ব্যর্থ CSV।
 */
export function HousingImportPage() {
  const toast = useToast()
  const api = getHousingApi()
  const projects = useHousingProjects()
  const [projectType, setProjectType] = useState<ProjectType>('semi_pucca')
  const projectSlug = projects.find((p) => p.key === projectType)?.slug ?? projectType
  const [mode, setMode] = useState<Mode>('insert')
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Mapping>([])
  const [geoFixes, setGeoFixes] = useState<Record<string, string>>({})
  const [nextSerial, setNextSerial] = useState<number | null>(null)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [useFillDown, setUseFillDown] = useState(true)
  const [insertMissing, setInsertMissing] = useState(false)
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)

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
    if (!f) return
    try {
      const parsed = await parseSpreadsheet(f)
      setSheet(parsed)
      setMapping(guessMapping(parsed.headers))
    } catch (err) {
      setParseError(HousingApiError.from(err).message)
    }
  }

  // ---- বিশ্লেষণ ----
  const hasSerialCol = mapping.includes('serial_no')
  // খালি সাল/বিভাগ/জেলা/উপজেলা → উপরের সারির মান (শীটে একবার লিখে নিচে খালি রাখার রীতি)
  const filled = useMemo(() => (sheet && useFillDown ? fillDown(sheet.rows, mapping) : { rows: sheet?.rows ?? [], filled: 0 }), [sheet, mapping, useFillDown])
  const analysis: ImportAnalysis | null = useMemo(() => {
    if (!sheet) return null
    return analyzeRows(filled.rows, mapping, {
      geoFixes,
      serialFromFile: hasSerialCol,
      startSerial: nextSerial ?? 1,
    })
  }, [sheet, filled, mapping, geoFixes, hasSerialCol, nextSerial])

  const missingRequired = REQUIRED_FIELDS.filter((f) => !mapping.includes(f))
  const modeNeedsSerial = mode === 'update' && !hasSerialCol
  const canRun = !!analysis && analysis.validCount > 0 && missingRequired.length === 0 && !modeNeedsSerial && !running

  const setMap = (i: number, field: ImportField | null) =>
    setMapping((m) => m.map((f, j) => (j === i ? field : f === field && field !== null ? null : f)))

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
    setResult(null)
    setRunning({ done: 0, total: valid.length })
    const toRow = (r: ImportRow): HousingBulkRow => ({
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
    })
    try {
      for (let start = 0; start < valid.length; start += BATCH) {
        const chunk = valid.slice(start, start + BATCH)
        try {
          if (mode === 'insert') {
            const out = await api.bulkInsert({ project_type: projectType, mode: 'use_given_serial', rows: chunk.map(toRow) })
            res.ok += out.inserted
            if (out.failed.length) {
              // চাঙ্ক-স্তরে ব্যর্থ → চাঙ্কের সব সারি ব্যর্থ (ইনসার্ট হয়নি)
              const reason = out.failed.map((f) => f.error.message).join('; ')
              for (const r of chunk.slice(out.inserted)) res.failed.push({ rowNo: r.rowNo, serial: r.values.serial_no, name: r.values.name, reason })
            }
          } else {
            const out = await api.bulkUpdateBySerial({
              project_type: projectType,
              rows: chunk.map((r) => ({ ...toRow(r), serial_no: r.values.serial_no! })),
            })
            res.ok += out.updated
            res.missing.push(...out.missing)
            if (insertMissing && out.missing.length) {
              const miss = new Set(out.missing)
              const toInsert = chunk.filter((r) => r.values.serial_no !== null && miss.has(r.values.serial_no))
              const ins = await api.bulkInsert({ project_type: projectType, mode: 'use_given_serial', rows: toInsert.map(toRow) })
              res.ok += ins.inserted
              res.missing = res.missing.filter((s) => !miss.has(s))
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
      if (res.ok) toast.success(mode === 'insert' ? t('{n} টি সারি যোগ হয়েছে', { n: formatBanglaNumber(res.ok) }) : t('{n} টি সারি আপডেট হয়েছে', { n: formatBanglaNumber(res.ok) }))
      if (res.failed.length) toast.error(t('{n} টি সারি ব্যর্থ/বাদ — নিচে তালিকা', { n: formatBanglaNumber(res.failed.length) }))
      void api.logActivity('import_run', { mode, file: file?.name ?? '', rows: valid.length, [mode === 'insert' ? 'inserted' : 'updated']: res.ok, failed: res.failed.length, missing: res.missing.length }, projectType)
      api.nextSerial(projectType).then(setNextSerial).catch(() => {})
    }
  }, [analysis, api, mode, projectType, insertMissing, toast, file])

  const downloadFailed = () => {
    if (!result) return
    const rows = result.failed.map((f) => [f.rowNo, f.serial ?? '', f.name, f.reason])
    const missingRows = result.missing.map((s) => ['', s, '', t('সিরিয়াল ধরে রেকর্ড পাওয়া যায়নি (আপডেট হয়নি)')])
    downloadText(`import-failed-${projectSlug}.csv`, toCsv([t('ফাইলের সারি'), t('সিরিয়াল'), t('নাম'), t('কারণ')], [...rows, ...missingRows]))
  }

  const previewRows = useMemo(() => {
    if (!analysis) return []
    const src = onlyErrors ? analysis.rows.filter((r) => r.errors.length || r.warnings.length) : analysis.rows
    return src.slice(0, PREVIEW_LIMIT)
  }, [analysis, onlyErrors])

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
            <select id="imp-project" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={projectType} onChange={(e) => setProjectType(e.target.value as ProjectType)} disabled={!!running}>
              {projects.map((p) => (
                <option key={p.key} value={p.key}>
                  {lt(p, 'name')}
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
            {mode === 'update' && (
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
                <select className="h-9 w-40 rounded-md border border-slate-300 bg-white px-2 text-xs" value={mapping[i] ?? ''} onChange={(e) => setMap(i, (e.target.value || null) as ImportField | null)} disabled={!!running} aria-label={t('"{h}" কলামের ফিল্ড', { h })}>
                  <option value="">{t('— উপেক্ষা —')}</option>
                  {IMPORT_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {t(FIELD_LABEL[f])}
                      {REQUIRED_FIELDS.includes(f) ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {t('আবশ্যক ফিল্ড ম্যাপ হয়নি: {fields}', { fields: missingRequired.map((f) => t(FIELD_LABEL[f])).join(', ') })}
            </p>
          )}
          {modeNeedsSerial && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {t('"সিরিয়াল ধরে আপডেট" মোডে সিরিয়াল কলাম ম্যাপ করা আবশ্যক।')}
            </p>
          )}
          {mode === 'insert' && (
            <p className="mt-2 text-xs text-slate-600">
              {t('সিরিয়াল: {info}', { info: hasSerialCol ? t('ফাইলের সিরিয়াল কলাম ব্যবহার হবে (সংখ্যা, অনন্য, ফাঁকা নয়)') : t('ফাইলে সিরিয়াল কলাম নেই — সারির ক্রমে {n} থেকে দেওয়া হবে', { n: toBanglaNumber(nextSerial ?? 1) }) })}
            </p>
          )}
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={useFillDown} onChange={(e) => setUseFillDown(e.target.checked)} disabled={!!running} className="mt-0.5 accent-brand-700" />
            <span>
              {t('খালি')} <strong>{t('সাল / বিভাগ / জেলা / উপজেলা')}</strong> {t('ঘরে উপরের সারির মান ধরুন (শীটে একবার লিখে নিচে খালি রাখলে)')}
              {filled.filled > 0 && <span className="ml-1 text-xs text-slate-500">— {t('{n} টি ঘর ভরা হয়েছে', { n: formatBanglaNumber(filled.filled) })}</span>}
            </span>
          </label>
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

          {analysis.unresolvedGeo.length > 0 && (
            <GeoFixPanel items={analysis.unresolvedGeo} rows={analysis.rows} fixes={geoFixes} onFix={(key, value) => setGeoFixes((f) => ({ ...f, [key]: value }))} />
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
                  <th className="px-2 py-2">{t('ঠিকানা')}</th>
                  <th className="px-2 py-2">{t('ছবি লিঙ্ক')}</th>
                  <th className="px-2 py-2">{t('অবস্থা')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((r) => (
                  <tr key={r.rowNo} className={r.errors.length ? 'bg-red-50' : r.warnings.length ? 'bg-amber-50/60' : ''}>
                    <td className="px-2 py-1.5 text-slate-500">{toBanglaNumber(r.rowNo)}</td>
                    <td className="px-2 py-1.5 font-medium tabular-nums">{r.values.serial_no !== null ? toBanglaNumber(r.values.serial_no) : <Bad>{r.raw.serial_no || '—'}</Bad>}</td>
                    <td className="px-2 py-1.5">{r.values.year !== null ? toBanglaNumber(r.values.year) : <Bad>{r.raw.year || '—'}</Bad>}</td>
                    <td className="px-2 py-1.5">{r.values.name || <Bad>—</Bad>}</td>
                    <td className="px-2 py-1.5">{r.values.father_or_husband_name || '—'}</td>
                    <GeoCell value={r.values.division} raw={r.raw.division} corrected={r.geo.corrected.includes('division')} />
                    <GeoCell value={r.values.district} raw={r.raw.district} corrected={r.geo.corrected.includes('district')} />
                    <GeoCell value={r.values.upazila} raw={r.raw.upazila} corrected={r.geo.corrected.includes('upazila')} />
                    <td className="max-w-[12rem] truncate px-2 py-1.5 text-slate-600" title={r.values.address}>
                      {r.values.address || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">
                      {r.values.prev_photo_source ? '✓' : '–'} / {r.values.current_photo_source ? '✓' : '–'}
                    </td>
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
              {mode === 'insert' ? t('{n} টি সারি যোগ করুন', { n: formatBanglaNumber(analysis.validCount) }) : t('{n} টি সারি আপডেট করুন', { n: formatBanglaNumber(analysis.validCount) })}
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
                {mode === 'update' && <li className="text-amber-800">{t('সিরিয়াল মিলেনি (আপডেট হয়নি): {n}', { n: formatBanglaNumber(result.missing.length) })}</li>}
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

function GeoCell({ value, raw, corrected }: { value: string | null; raw: string; corrected: boolean }) {
  if (!value) {
    return (
      <td className="px-2 py-1.5">
        <Bad>{raw || '—'}</Bad>
      </td>
    )
  }
  return (
    <td className="px-2 py-1.5" title={corrected ? t('ফাইলে: "{raw}"', { raw }) : undefined}>
      {gn(value)}
      {corrected && <span className="ml-1 text-[10px] text-amber-700">{t('(সংশোধিত)')}</span>}
    </td>
  )
}

/** না-মেলা ভৌগোলিক নামের প্যানেল: পরামর্শ + সম্পূর্ণ তালিকা থেকে বাছাই; একবার ঠিক করলে একই মানের সব সারিতে প্রযোজ্য */
function GeoFixPanel({ items, rows, fixes, onFix }: { items: ImportAnalysis['unresolvedGeo']; rows: ImportRow[]; fixes: Record<string, string>; onFix: (key: string, value: string) => void }) {
  const LEVEL = { division: 'বিভাগ', district: 'জেলা', upazila: 'উপজেলা' } as const
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">{t('ভৌগোলিক নাম মেলেনি — সঠিক নাম বেছে দিন ({n} টি স্বতন্ত্র মান)', { n: formatBanglaNumber(items.length) })}</p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => {
          // এই মানের প্রথম সারি থেকে parent প্রসঙ্গ
          const sample = rows.find((r) => r.geo.unresolved.some((u) => u.level === it.level && u.raw === it.raw))
          const parentDivision = sample?.geo.division ?? null
          const parentDistrict = sample?.geo.district ?? null
          const options = candidatesFor(it.level, parentDivision, parentDistrict)
          const key = geoFixKey(it.level, it.raw, it.parent)
          return (
            <li key={it.key} className="flex flex-wrap items-center gap-2 rounded-md bg-white px-3 py-2 text-sm">
              <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">{t(LEVEL[it.level])}</span>
              <span className="font-medium text-slate-800">"{it.raw}"</span>
              <span className="text-xs text-slate-500">({t('{n} সারি', { n: formatBanglaNumber(it.count) })}{it.parent ? `, ${gn(it.parent)}` : ''})</span>
              <span className="text-slate-400">→</span>
              <select className="h-9 min-w-[12rem] rounded-md border border-slate-300 bg-white px-2 text-sm" value={fixes[key] ?? ''} onChange={(e) => e.target.value && onFix(key, e.target.value)} aria-label={t('"{raw}" এর সঠিক {level}', { raw: it.raw, level: t(LEVEL[it.level]) })}>
                <option value="">{t('— বেছে নিন —')}</option>
                {it.suggestions.length > 0 && (
                  <optgroup label={t('পরামর্শ')}>
                    {it.suggestions.map((s) => (
                      <option key={`s-${s}`} value={s}>
                        {gn(s)}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={t('সম্পূর্ণ তালিকা')}>
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {gn(o)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
