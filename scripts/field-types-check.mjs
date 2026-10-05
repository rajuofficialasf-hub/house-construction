#!/usr/bin/env node
/**
 * field-types-check (পর্ব ২, M-ধাপ ৫খ) — ফিল্ড-টাইপ রেজিস্ট্রি, টাকা আর fuzzy মিলের নিয়ম পরীক্ষা (নেটওয়ার্ক নেই, কিছু লেখে না):
 *   - lib/money.ts: parseBanglaNumber ("১০,০০০/-" → 10000, "Tk 5,000" → 5000, "abc" → ত্রুটি …), formatTaka (বাংলা/ইংরেজি)
 *   - features/projects/fields: প্রতিটি ধরনের parse (ডাটাবেসের housing_field_value এর নিয়মে), format, toCsv, toInput,
 *     ত্রুটির বার্তা (দুই ভাষা), resolveFields (core_fields, ইউনিয়ন, গোপন/আর্কাইভ), fieldValue
 *   - lib/fuzzyMatch.ts: looseKey, nearDuplicates ("গাভী" ≈ "গাভি", কিন্তু "গরু" ≠ "গরুর")
 * চালানো: npm run field-types-check
 */
import { setCurrentLang } from '../src/i18n/core.ts'
import { formatTaka, parseBanglaNumber } from '../src/lib/money.ts'
import { levenshtein, looseKey, nearDuplicates } from '../src/lib/fuzzyMatch.ts'
import { FIELD_TYPES } from '../src/backend/interfaces/types.ts'
import { FALLBACK_PROJECTS } from '../src/backend/fallbackProjects.ts'
import { FIELD_TYPE_SPECS, fieldErrorMessage, fieldSpec, fieldValue, formatField, parseField, resolveFields } from '../src/features/projects/fields/index.ts'

let pass = 0
let fail = 0
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) || (Number.isNaN(a) && Number.isNaN(b))
function eq(name, got, want) {
  const okk = same(got, want)
  if (okk) pass++
  else fail++
  console.log(`${okk ? 'PASS' : 'FAIL'}  ${name}${okk ? '' : `\n      পেয়েছি: ${JSON.stringify(got)} · চাই: ${JSON.stringify(want)}`}`)
}
const section = (s) => console.log(`\n— ${s}`)

/** পরীক্ষার ফিল্ড-সংজ্ঞা */
const def = (type, extra = {}) => ({
  key: 'f', source: 'extra', type, label_bn: 'ফিল্ড', label_en: 'Field', help_bn: '', help_en: '', required: false, visibility: 'public',
  max_length: null, min_value: null, max_value: null, show_in_table: true, show_in_card: false, show_in_detail: true,
  filterable: false, searchable: false, fill_down: false, import_aliases: [], sort_order: 0, is_active: true, ...extra,
})
const P = (d, raw) => {
  const r = parseField(d, raw)
  return r.ok ? r.value : `ERR:${r.error.code}`
}

setCurrentLang('bn')

// ---------------------------------------------------------------- টাকা ও সংখ্যা
section('parseBanglaNumber')
eq('"১০,০০০/-" → 10000', parseBanglaNumber('১০,০০০/-'), 10000)
eq('"Tk 5,000" → 5000', parseBanglaNumber('Tk 5,000'), 5000)
eq('"Tk5,000" → 5000', parseBanglaNumber('Tk5,000'), 5000)
eq('"৳ ১,২৩,৪৫৬" → 123456', parseBanglaNumber('৳ ১,২৩,৪৫৬'), 123456)
eq('"২৫০০০ টাকা" → 25000', parseBanglaNumber('২৫০০০ টাকা'), 25000)
eq('"BDT 1,000/=" → 1000', parseBanglaNumber('BDT 1,000/='), 1000)
eq('"1,23,456.50" → 123456.5', parseBanglaNumber('1,23,456.50'), 123456.5)
eq('JSON number 5000 → 5000', parseBanglaNumber(5000), 5000)
eq('"" ও "  " → null (মান নেই)', [parseBanglaNumber(''), parseBanglaNumber('  ')], [null, null])
eq('"abc", "৳", "12abc", "1e5" → NaN (ত্রুটি)', [parseBanglaNumber('abc'), parseBanglaNumber('৳'), parseBanglaNumber('12abc'), parseBanglaNumber('1e5')].every(Number.isNaN), true)

section('formatTaka (প্রশ্ন ৯-এর ডিফল্ট)')
eq('বাংলা: ৳ ১,২৩,৪৫৬', formatTaka(123456), '৳ ১,২৩,৪৫৬')
eq('বাংলা: ৳ ১,০০,০০,০০০ (এক কোটি — সংক্ষেপ নয়)', formatTaka(10000000), '৳ ১,০০,০০,০০০')
setCurrentLang('en')
eq('ইংরেজি: ৳123,456', formatTaka(123456), '৳123,456')
setCurrentLang('bn')
eq('null → ""', formatTaka(null), '')

// ---------------------------------------------------------------- প্রতিটি ধরন: parse
section('parse — টাকা (money)')
const money = def('money')
eq('"১০,০০০/-" → 10000', P(money, '১০,০০০/-'), 10000)
eq('"Tk 5,000" → 5000', P(money, 'Tk 5,000'), 5000)
eq('"abc" → ত্রুটি (সংখ্যা নয়)', P(money, 'abc'), 'ERR:not_number')
eq('"100.50" → ত্রুটি (পয়সা নয়)', P(money, '100.50'), 'ERR:money_fraction')
eq('"-5" → ত্রুটি (সীমার বাইরে)', P(money, '-5'), 'ERR:money_range')
eq('100000000001 → ত্রুটি (সীমার বাইরে)', P(money, 100000000001), 'ERR:money_range')
eq('খালি → null; আবশ্যক হলে ত্রুটি', [P(money, ''), P(def('money', { required: true }), ' ')], [null, 'ERR:required'])
eq('min/max (১০০০–৫০০০০)', [P(def('money', { min_value: 1000, max_value: 50000 }), '৫০০'), P(def('money', { min_value: 1000, max_value: 50000 }), '60000')], ['ERR:min', 'ERR:max'])

section('parse — সংখ্যা (number)')
const num = def('number')
eq('"১২.৫" → 12.5', P(num, '১২.৫'), 12.5)
eq('"1,234.56" → 1234.56', P(num, '1,234.56'), 1234.56)
eq('"1.234" → ত্রুটি (২ ঘরের বেশি দশমিক)', P(num, '1.234'), 'ERR:decimals')
eq('"-3" → -3 (সংখ্যায় ঋণাত্মক চলে)', P(num, '-3'), -3)
eq('সাল (পূর্ণসংখ্যা, ২০০০–২১০০): "২০২৪" → 2024, "2024.5" ও "১৯৯৯" ত্রুটি',
  [P(def('number', { integer: true, min_value: 2000, max_value: 2100 }), '২০২৪'), P(def('number', { integer: true }), '2024.5'), P(def('number', { integer: true, min_value: 2000 }), '১৯৯৯')],
  [2024, 'ERR:not_integer', 'ERR:min'])

section('parse — ক্যাটাগরি (category)')
const cat = def('category')
eq('"  গরু  " → "গরু" (ফাঁকা বাদ)', P(cat, '  গরু  '), 'গরু')
eq('"দুগ্ধবতী   গাভী" → এক ফাঁকা', P(cat, 'দুগ্ধবতী   গাভী'), 'দুগ্ধবতী গাভী')
eq('NFC: ভিন্ন Unicode রূপে লেখা (NFD) → NFC', P(cat, 'মুদি দোকান'.normalize('NFD')), 'মুদি দোকান'.normalize('NFC'))
eq('১০১ অক্ষর → ত্রুটি (সর্বোচ্চ ১০০)', P(cat, 'ক'.repeat(101)), 'ERR:too_long')

section('parse — লেখা ও বড় লেখা (text, long_text)')
eq('text: দুই পাশের ফাঁকা বাদ', P(def('text'), '  দুগ্ধবতী গাভী '), 'দুগ্ধবতী গাভী')
eq('text: ভেতরের ফাঁকা অপরিবর্তিত (শুধু ক্যাটাগরিতে এক করা হয়)', P(def('text'), 'ক  খ'), 'ক  খ')
eq('text: ৫০১ অক্ষর → ত্রুটি (ডিফল্ট সীমা ৫০০); max_length ৫ হলে ৬ অক্ষরে ত্রুটি', [P(def('text'), 'ক'.repeat(501)), P(def('text', { max_length: 5 }), 'কখগঘঙচ')], ['ERR:too_long', 'ERR:too_long'])
eq('long_text: ২০০০ অক্ষর চলে, ২০০১ এ ত্রুটি', [typeof P(def('long_text'), 'ক'.repeat(2000)), P(def('long_text'), 'ক'.repeat(2001))], ['string', 'ERR:too_long'])
eq('শীটের সংখ্যা (JSON number) লেখা-ফিল্ডে → লেখা', P(def('text'), 12), '12')

section('parse — তারিখ (date)')
const date = def('date')
eq('"2025-03-15" → ISO', P(date, '2025-03-15'), '2025-03-15')
eq('"১৫/০৩/২০২৫" → 2025-03-15', P(date, '১৫/০৩/২০২৫'), '2025-03-15')
eq('"5.3.2025" ও "2025/3/5" → ISO', [P(date, '5.3.2025'), P(date, '2025/3/5')], ['2025-03-05', '2025-03-05'])
eq('"31/02/2025" (নেই) ও "আগামীকাল" → ত্রুটি', [P(date, '31/02/2025'), P(date, 'আগামীকাল')], ['ERR:date', 'ERR:date'])

section('parse — মোবাইল (phone)')
const phone = def('phone', { visibility: 'admin', source: 'private' })
eq('"০১৭১১-৯৮৭৬৫৪" → ইংরেজি অঙ্ক', P(phone, '০১৭১১-৯৮৭৬৫৪'), '01711-987654')
eq('"+880 1711 987654" চলে', P(phone, '+880 1711 987654'), '+880 1711 987654')
eq('"abc", "12345" (৬ এর কম) → ত্রুটি', [P(phone, 'abc'), P(phone, '12345')], ['ERR:phone', 'ERR:phone'])

// ---------------------------------------------------------------- format / toCsv / toInput
section('format (দেখানো) — বাংলা')
eq('টাকা', formatField(money, 123456), '৳ ১,২৩,৪৫৬')
eq('সংখ্যা: ১,২৩,৪৫৬.৫', formatField(num, 123456.5), '১,২৩,৪৫৬.৫')
eq('সাল কমা ছাড়া: ২০২৪ (২,০২৪ নয়)', formatField(def('number', { integer: true, plain: true }), 2024), '২০২৪')
eq('তারিখ: ১৫/০৩/২০২৫', formatField(date, '2025-03-15'), '১৫/০৩/২০২৫')
eq('মান নেই → ""', [formatField(money, null), formatField(cat, undefined), formatField(date, '')], ['', '', ''])
setCurrentLang('en')
section('format (দেখানো) — ইংরেজি')
eq('টাকা: ৳123,456', formatField(money, 123456), '৳123,456')
eq('সংখ্যা: 123,456.5', formatField(num, 123456.5), '123,456.5')
eq('তারিখ: 15/03/2025', formatField(date, '2025-03-15'), '15/03/2025')
eq('ক্যাটাগরি ইংরেজি মোডেও যেমন লেখা তেমন: গরু', formatField(cat, 'গরু'), 'গরু')
setCurrentLang('bn')

section('toCsv / toInput (যন্ত্র-পাঠযোগ্য, আবার ইম্পোর্ট করা যায়)')
eq('টাকা → "123456" (কমা/৳ নেই)', fieldSpec('money').toCsv(123456, money), '123456')
eq('সংখ্যা → "12.5"', fieldSpec('number').toCsv(12.5, num), '12.5')
eq('তারিখ → ISO', fieldSpec('date').toCsv('2025-03-15', date), '2025-03-15')
eq('ইনপুটে টাকা → "25000" (সম্পাদনার জন্য সাধারণ সংখ্যা)', fieldSpec('money').toInput(25000, money), '25000')
eq('CSV → parse ফিরে একই মান (round-trip): টাকা, সংখ্যা, তারিখ, ক্যাটাগরি',
  [P(money, fieldSpec('money').toCsv(987654, money)), P(num, fieldSpec('number').toCsv(-12.25, num)), P(date, fieldSpec('date').toCsv('2024-12-31', date)), P(cat, fieldSpec('category').toCsv('গরু', cat))],
  [987654, -12.25, '2024-12-31', 'গরু'])

section('রেজিস্ট্রি সম্পূর্ণ')
eq('ডাটাবেসের সব ধরনের (FIELD_TYPES) parse/format/toCsv/toInput/Input/Cell আছে',
  FIELD_TYPES.every((tp) => ['parse', 'format', 'toCsv', 'toInput', 'Input', 'Cell'].every((k) => typeof FIELD_TYPE_SPECS[tp]?.[k] === 'function')), true)
eq('টাকা ও সংখ্যা টেবিলে ডানে, বাকি বামে', FIELD_TYPES.map((tp) => `${tp}:${FIELD_TYPE_SPECS[tp].align}`).join(','),
  'text:left,long_text:left,number:right,money:right,category:left,date:left,phone:left')

section('ত্রুটির বার্তা')
eq('বাংলা', fieldErrorMessage({ code: 'too_long', limit: 100 }), 'লেখা বেশি লম্বা (সর্বোচ্চ ১০০ অক্ষর)')
setCurrentLang('en')
eq('ইংরেজি', fieldErrorMessage({ code: 'too_long', limit: 100 }), 'Text is too long (at most 100 characters)')
eq('ইংরেজি: আবশ্যক', fieldErrorMessage({ code: 'required' }), 'Required')
setCurrentLang('bn')

// ---------------------------------------------------------------- fuzzy
section('fuzzyMatch')
const dups = nearDuplicates(['গাভী', 'গাভি', 'গরু', 'গরুর', ' গরু ', 'ছাগল', 'ছাগোল', 'মুদি দোকান'])
const has = (a, b) => dups.some((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a))
eq('"গাভী" ও "গাভি" কাছাকাছি (দূরত্ব ০ — শুধু ী/ি)', has('গাভী', 'গাভি') && dups.find((d) => has(d.a, d.b) && [d.a, d.b].includes('গাভি')).distance === 0, true)
eq('"ছাগল" ও "ছাগোল" কাছাকাছি (দূরত্ব ১, ৪+ অক্ষর)', has('ছাগল', 'ছাগোল'), true)
eq('"গরু" ও "গরুর" আলাদা (ছোট শব্দে এক অক্ষরের পার্থক্য ধরা হয় না)', has('গরু', 'গরুর'), false)
eq('"গরু" ও " গরু " একই মান — জোড়া নয়', dups.some((d) => d.a.trim() === d.b.trim()), false)
eq('"গরু" ও "গাভি" আলাদা', has('গরু', 'গাভি'), false)
eq('looseKey: শ্রীপুর = শ্রিপুর = শ্রীপূর', new Set([looseKey('শ্রীপুর'), looseKey('শ্রিপুর'), looseKey('শ্রীপূর')]).size, 1)
eq('levenshtein("কাটা", "কাঁটা") = 1', levenshtein('কাটা', 'কাঁটা'), 1)

// ---------------------------------------------------------------- resolveFields
section('resolveFields')
const semi = FALLBACK_PROJECTS.find((p) => p.key === 'semi_pucca')
eq('সেমিপাকা (ইউনিয়ন-স্তর): সিস্টেম ফিল্ডের ক্রম', resolveFields(semi).map((f) => f.key),
  ['year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila', 'union_name', 'address'])
eq('উপজেলা-স্তরের প্রকল্পে ইউনিয়ন নেই', resolveFields({ ...semi, geo_depth: 'upazila' }).some((f) => f.key === 'union_name'), false)
eq('ঘর নির্মাণের লেবেল এখনকার ফর্মের মতো', resolveFields(semi).slice(0, 3).map((f) => f.label_bn), ['সাল', 'উপকারভোগীর নাম', 'পিতা/স্বামীর নাম'])
const pf = (key, type, extra = {}) => ({ id: key, project_key: 'sr', key, label_bn: key, label_en: '', help_bn: '', help_en: '', type, options: [], required: false, visibility: 'public',
  show_in_table: true, show_in_card: false, show_in_detail: true, filterable: false, searchable: false, fill_down: false, max_length: null, min_value: null, max_value: null,
  import_aliases: [], sort_order: 10, is_active: true, created_at: '', updated_at: '', ...extra })
const sr = {
  ...semi, key: 'sr', parent_key: null, geo_depth: 'union',
  core_fields: { address: { enabled: false }, father_or_husband_name: { required: true, label_bn: 'স্বামীর নাম' }, year: { required: false, label_bn: 'অনুদানের সাল' } },
  fields: [pf('category', 'category', { sort_order: 20 }), pf('amount', 'money', { required: true, sort_order: 10, min_value: '1000' }), pf('phone', 'phone', { visibility: 'admin', show_in_table: false, sort_order: 30 }), pf('old', 'text', { is_active: false, sort_order: 5 })],
}
const r1 = resolveFields(sr)
eq('core_fields: ঠিকানা বন্ধ, পিতা/স্বামী আবশ্যক ও নতুন লেবেল; সাল সবসময় আবশ্যক (শুধু লেবেল বদলায়)',
  [r1.some((f) => f.key === 'address'), r1.find((f) => f.key === 'father_or_husband_name').required, r1.find((f) => f.key === 'father_or_husband_name').label_bn, r1.find((f) => f.key === 'year').required, r1.find((f) => f.key === 'year').label_bn],
  [false, true, 'স্বামীর নাম', true, 'অনুদানের সাল'])
eq('কাস্টম ফিল্ড sort_order ক্রমে, আর্কাইভ বাদ, গোপন আছে (এডমিন)', r1.filter((f) => f.source !== 'system').map((f) => `${f.key}:${f.source}`), ['amount:extra', 'category:extra', 'phone:private'])
eq('includePrivate:false → গোপন বাদ; includeArchived → আর্কাইভসহ', [resolveFields(sr, { includePrivate: false }).some((f) => f.key === 'phone'), resolveFields(sr, { includeArchived: true }).some((f) => f.key === 'old')], [false, true])
const rec = { ...{ id: 'x', project_type: 'sr', serial_no: 1, year: 2025, name: 'রহিমা', father_or_husband_name: '', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার', union_name: 'আশুলিয়া', address: '' }, extra: { amount: 25000, category: 'গরু' } }
const F = (k) => r1.find((f) => f.key === k)
eq('fieldValue: সিস্টেম, কাস্টম, গোপন', [fieldValue(F('name'), rec), fieldValue(F('amount'), rec), fieldValue(F('phone'), rec, { phone: '01711987654' }), fieldValue(F('phone'), rec)], ['রহিমা', 25000, '01711987654', null])
eq('কাস্টম ফিল্ডের min_value মানা হয় (টাকা ৫০০ < ১০০০)', P({ ...F('amount'), min_value: 1000 }, '৫০০'), 'ERR:min')

// ---------------------------------------------------------------- এডমিন: ফিল্ডের key, টেবিলের কলাম, কার্ড (M-ধাপ ৮)
section('ফিল্ডের key ও কলাম-গণনা (M-ধাপ ৮)')
const { fieldKeyFrom, fieldKeyError, tableColumns, SENSITIVE_LABEL } = await import('../src/features/admin/projects/fieldRules.ts')
const { transliterate } = await import('../src/lib/transliterate.ts')
eq('লিপ্যন্তর: "উপকরণের নাম" → "upokoroner nam"', transliterate('উপকরণের নাম'), 'upokoroner nam')
eq('শুধু বাংলা লেবেল → বৈধ key', fieldKeyFrom('', 'উপকরণের নাম', []), 'upokoroner_nam')
eq('ইংরেজি লেবেল থাকলে সেখান থেকে: "Item name" → item_name', fieldKeyFrom('Item name', 'উপকরণের নাম', []), 'item_name')
eq('ব্যবহৃত key হলে _2', fieldKeyFrom('Amount', '', ['amount']), 'amount_2')
eq('সিস্টেমের নাম (name, prev_x) হলে সামনে f_', [fieldKeyFrom('Name', '', []), fieldKeyFrom('prev photo', '', [])], ['f_name', 'f_prev_photo'])
eq('লেখা থেকে key না হলে field_<n>', fieldKeyFrom('', '!!!', ['a', 'b']), 'field_3')
eq('যুক্তাক্ষর ও য়: "মোবাইল নম্বর" → mobail_nombor, "জাতীয় পরিচয়পত্র" বৈধ key', [fieldKeyFrom('', 'মোবাইল নম্বর', []), fieldKeyError(fieldKeyFrom('', 'জাতীয় পরিচয়পত্র', []), [])], ['mobail_nombor', null])
eq('key এর ত্রুটি: সংরক্ষিত, ফরম্যাট, ডুপ্লিকেট', [!!fieldKeyError('year', []), !!fieldKeyError('1abc', []), !!fieldKeyError('amount', ['amount']), fieldKeyError('amount', [])], [true, true, true, null])
eq('গোপন-তথ্যের লেবেল চেনা: মোবাইল, NID, জাতীয় পরিচয়, phone; "নাম" নয়', ['মোবাইল নম্বর', 'NID', 'জাতীয় পরিচয়পত্র নম্বর', 'Phone', 'নাম'].map((s) => SENSITIVE_LABEL.test(s)), [true, true, true, true, false])
eq('টেবিলের কলাম: সেমিপাকা (ঠিকানা আলাদা, ইউনিয়নসহ) = ৮', tableColumns(semi).length, 8)
const grantLike = { ...semi, display: { geo_columns: 'merged' }, fields: [pf('category', 'category', { show_in_table: true, sort_order: 10 }), pf('amount', 'money', { show_in_table: true, sort_order: 30 }), pf('item_name', 'text', { show_in_table: false, sort_order: 20 }), pf('phone', 'phone', { visibility: 'admin', show_in_table: true, sort_order: 40 })] }
eq('অনুদান ধরন (ঠিকানা একসাথে): সাল, নাম, পিতা, ঠিকানা(ভূগোল), বিস্তারিত ঠিকানা, ক্যাটাগরি, টাকা = ৭ (গোপন ফিল্ড টেবিলে নয়)', tableColumns(grantLike).map((f) => f.key), ['year', 'name', 'father_or_husband_name', 'geo', 'address', 'category', 'amount'])

section('পরিসংখ্যান কার্ড (M-ধাপ ৮)')
const { cardValue, formatCardValue, suggestCard, newCardId } = await import('../src/features/projects/stats/statCards.ts')
const st8 = { total: 12, distinct: { divisions: 2, districts: 3, upazilas: 5, unions: 7 }, fields: { amount: { type: 'money', sum: 375000, count: 12 }, category: { type: 'category', distinct: 4 } } }
eq('কার্ডের মান: গণনা ১২, জেলা ৩, ইউনিয়ন ৭, মোট টাকা, মোট ক্যাটাগরি ৪', [cardValue({ kind: 'count' }, st8), cardValue({ kind: 'geo', level: 'district' }, st8), cardValue({ kind: 'geo', level: 'union' }, st8), cardValue({ kind: 'sum', field: 'amount' }, st8), cardValue({ kind: 'distinct', field: 'category' }, st8)], [12, 3, 7, 375000, 4])
eq('ডাটা নেই এমন ফিল্ডে ০; স্ট্যাট না এলে null', [cardValue({ kind: 'sum', field: 'amount' }, { ...st8, fields: {} }), cardValue({ kind: 'count' }, null)], [0, null])
eq('টাকা-কার্ড ৳ সহ: ৳ ৩,৭৫,০০০', formatCardValue({ kind: 'sum', format: 'money' }, 375000), '৳ ৩,৭৫,০০০')
const sr8 = { ...semi, unit_bn: 'উপকারভোগী', unit_en: 'beneficiaries' }
eq('প্রস্তাবিত লেবেল: গণনা, জেলা, টাকার যোগফল (৳ ফরম্যাট), ক্যাটাগরি', [suggestCard(sr8, 'count').label_bn, suggestCard(sr8, 'geo', { level: 'district' }).label_bn, suggestCard(sr8, 'sum', { field: pf('amount', 'money', { label_bn: 'টাকা' }) }).label_bn + '|' + suggestCard(sr8, 'sum', { field: pf('amount', 'money', { label_bn: 'টাকা' }) }).format, suggestCard(sr8, 'distinct', { field: pf('category', 'category', { label_bn: 'ক্যাটাগরি' }) }).label_bn], ['মোট উপকারভোগী', 'জেলা কভার', 'মোট টাকা|money', 'মোট ক্যাটাগরি'])
eq('কার্ডের id অনন্য', newCardId([{ id: 'sum_amount' }], 'sum', 'amount'), 'sum_amount_2')

section('রেকর্ড-ফর্ম, তালিকা ও CSV এক্সপোর্ট (M-ধাপ ১০)')
const { guardFormula, stripFormulaGuard, toCsv } = await import('../src/features/housing/utils/csvExport.ts')
const { adminLayout, photoKindsOf } = await import('../src/features/admin/records/recordColumns.ts')
const { csvPlan, csvFilename, hasPrivateFields } = await import('../src/features/admin/records/recordsCsv.ts')
const money10 = def('money', { required: true })
eq('টাকা: "১,২০,০০০" ও "১২০০০০/-" দুটোই 120000', [P(money10, '১,২০,০০০'), P(money10, '১২০০০০/-')], [120000, 120000])
eq('টাকা: "এক লাখ" → not_number', P(money10, 'এক লাখ'), 'ERR:not_number')
eq('ফর্মুলা-সুরক্ষা: = + - @ ট্যাব লাইন-ব্রেক → আগে \'', ['=1+1', '+88017', '-5', '@SUM', '\tx', '\nx', 'আলী', '১২'].map(guardFormula), ["'=1+1", "'+88017", "'-5", "'@SUM", "'\tx", "'\nx", 'আলী', '১২'])
eq('ইম্পোর্টে উল্টো: "\'=1+1" → "=1+1"; "\'আলী" অপরিবর্তিত', [stripFormulaGuard("'=1+1"), stripFormulaGuard("'আলী"), stripFormulaGuard('=x')], ['=1+1', "'আলী", '=x'])
eq('এক্সপোর্ট → ইম্পোর্ট ঘুরে আসে (সব ধরনের শুরু)', ['=1+1', '+8801', '-ক', '@a', 'সাধারণ'].every((s) => stripFormulaGuard(guardFormula(s)) === s), true)
const csv = toCsv(['নাম', 'টাকা'], [['=1+1', 120000], ['আলী, রহিম', -5], ['"উদ্ধৃতি"', null]])
eq('toCsv: BOM, লেখার সেলে \', সংখ্যায় নয় (−৫ যেমন), কমা/উদ্ধৃতি ঠিক', csv, "﻿নাম,টাকা\r\n'=1+1,120000\r\n\"আলী, রহিম\",-5\r\n\"\"\"উদ্ধৃতি\"\"\",\r\n")
eq('ঘর নির্মাণের তালিকা-কলাম আগের মতো: সাল, নাম, পিতা/স্বামী, ঠিকানা, ছবি', adminLayout(semi).columns.map((c) => (c.kind === 'field' ? c.def.key : c.kind)), ['year', 'name', 'father_or_husband_name', 'address', 'photos'])
const grant10 = { ...semi, key: 'demo', slug: 'demo', photo_mode: 'after_only', current_label_bn: 'উপকরণসহ ছবি', core_fields: { year: { label_bn: 'অনুদানের সাল' } }, fields: [pf('category', 'category', { show_in_table: true, show_in_card: true, sort_order: 10 }), pf('item_name', 'text', { show_in_table: false, show_in_card: true, sort_order: 20 }), pf('amount', 'money', { show_in_table: true, show_in_card: true, sort_order: 30 }), pf('mobile', 'phone', { visibility: 'admin', sort_order: 40, label_bn: 'মোবাইল নম্বর' }), pf('old', 'text', { is_active: false, sort_order: 50, label_bn: 'পুরনো' })] }
const L = adminLayout(grant10)
eq('অনুদান: কলাম = …, ঠিকানা, ক্যাটাগরি, টাকা, ছবি (গোপন/আর্কাইভ নেই); কার্ডে ৩টি; মোট টাকায়', [L.columns.map((c) => (c.kind === 'field' ? c.def.key : c.kind)), L.cardFields.map((d) => d.key), L.moneyFields.map((d) => d.key), photoKindsOf(grant10)], [['year', 'name', 'father_or_husband_name', 'address', 'category', 'amount', 'photos'], ['category', 'item_name', 'amount'], ['amount'], ['current']])
const rec10 = { id: 'r1', project_type: 'demo', serial_no: 3, year: 2025, name: '=1+1', father_or_husband_name: '', division: 'চট্টগ্রাম', district: 'চট্টগ্রাম', upazila: 'মীরসরাই', union_name: 'করেরহাট', address: '', extra: { category: 'গাভী', amount: 120000, old: 'x' }, prev_photo_url: null, prev_thumb_url: null, current_photo_url: 'https://x/c.webp', current_thumb_url: null, prev_photo_source: null, current_photo_source: 'https://sp/1', photo_updated_at: '2026-10-05T00:00:00Z', created_at: '', updated_at: '' }
const plan0 = csvPlan(grant10, false)
eq('CSV হেডার: বাংলা লেবেল (ইংরেজি মোডেও), আর্কাইভ চিহ্নিত, গোপন নেই, এক ছবির ঘর', plan0.headers, ['সিরিয়াল', 'অনুদানের সাল', 'উপকারভোগীর নাম', 'পিতা/স্বামীর নাম', 'বিভাগ', 'জেলা', 'উপজেলা', 'ইউনিয়ন/পৌরসভা', 'বিস্তারিত ঠিকানা', 'category', 'item_name', 'amount', 'পুরনো (আর্কাইভ)', 'উপকরণসহ ছবি (লিঙ্ক)', 'উপকরণসহ ছবি (সিস্টেম URL)', 'ছবি আপডেট', 'রেকর্ড আইডি'])
eq('CSV সারি: টাকা ASCII সংখ্যা, ক্যাটাগরি যেমন, আর্কাইভের পুরনো মান থাকে', plan0.row(rec10).slice(0, 13), [3, 2025, '=1+1', '', 'চট্টগ্রাম', 'চট্টগ্রাম', 'মীরসরাই', 'করেরহাট', '', 'গাভী', '', 120000, 'x'])
const plan1 = csvPlan(grant10, true)
eq('গোপনসহ: মোবাইল কলাম ও মান; ফাইলের নাম -private', [plan1.headers.includes('মোবাইল নম্বর'), plan1.row(rec10, { mobile: '01711000000' }).includes('01711000000'), csvFilename(grant10, null, true, new Date('2026-10-05T10:00:00Z')), csvFilename(semi, 'housing', false, new Date('2026-10-05T10:00:00Z'))], [true, true, 'demo-2026-10-05-private.csv', 'housing-semi-pucca-2026-10-05.csv'])
eq('গোপন ফিল্ড আছে কি না (এক্সপোর্টে জিজ্ঞাসা)', [hasPrivateFields(grant10), hasPrivateFields(semi)], [true, false])
setCurrentLang('en')
eq('ইংরেজি মোডেও CSV হেডার বাংলা', csvPlan(grant10, false).headers[1], 'অনুদানের সাল')
setCurrentLang('bn')

console.log(`\nফল: PASS ${pass}, FAIL ${fail}`)
process.exit(fail ? 1 : 0)
