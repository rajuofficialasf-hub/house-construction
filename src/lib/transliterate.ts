/**
 * বাংলা → ইংরেজি অক্ষরে সরল লিপ্যন্তর (পর্ব ২, M-ধাপ ৮) — ফিল্ডের key বানাতে (বাংলা লেবেল থেকে, ইংরেজি না থাকলে)।
 * নিখুঁত উচ্চারণ নয়, শুধু পড়া যায় এমন বৈধ ASCII: "উপকরণের নাম" → "upokoroner nam"।
 * (এই ফাইলের বাংলা অক্ষর মেলানোর ডাটা — i18n-check এর বাইরে।)
 */
const INDEPENDENT: Record<string, string> = { অ: 'o', আ: 'a', ই: 'i', ঈ: 'i', উ: 'u', ঊ: 'u', ঋ: 'ri', এ: 'e', ঐ: 'oi', ও: 'o', ঔ: 'ou' }
const SIGNS: Record<string, string> = { 'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou' }
const CONSONANTS: Record<string, string> = {
  ক: 'k', খ: 'kh', গ: 'g', ঘ: 'gh', ঙ: 'ng', চ: 'ch', ছ: 'chh', জ: 'j', ঝ: 'jh', ঞ: 'n', ট: 't', ঠ: 'th', ড: 'd', ঢ: 'dh', ণ: 'n',
  ত: 't', থ: 'th', দ: 'd', ধ: 'dh', ন: 'n', প: 'p', ফ: 'f', ব: 'b', ভ: 'bh', ম: 'm', য: 'j', র: 'r', ল: 'l', শ: 'sh', ষ: 'sh',
  স: 's', হ: 'h', ৎ: 't',
}
const NUKTA: Record<string, string> = { য: 'y', ড: 'r', ঢ: 'rh' }
const HASANTA = '্'
const NUKTA_SIGN = '়'

/** "উপকরণের নাম" → "upokoroner nam" (শব্দের শেষে অন্তর্নিহিত "অ" বাদ) */
export function transliterate(bn: string): string {
  const s = bn.normalize('NFC')
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const next = s[i + 1]
    if (c in CONSONANTS) {
      let latin = CONSONANTS[c]
      let j = i + 1
      if (next === NUKTA_SIGN) {
        latin = NUKTA[c] ?? latin
        j++
      }
      const after = s[j]
      out += latin
      // অন্তর্নিহিত "o": পরে আরেকটি ব্যঞ্জন (যুক্তাক্ষর বা কার নয়) থাকলেই
      if (after && after !== HASANTA && !(after in SIGNS) && after in CONSONANTS) out += 'o'
      i = j - 1
    } else if (c in SIGNS) out += SIGNS[c]
    else if (c in INDEPENDENT) out += INDEPENDENT[c]
    else if (c === 'ং') out += 'ng'
    else if (c === 'ঃ') out += 'h'
    else if (c === HASANTA || c === 'ঁ' || c === NUKTA_SIGN) continue
    else if (/[০-৯]/.test(c)) out += String('০১২৩৪৫৬৭৮৯'.indexOf(c))
    else out += c
  }
  return out
}

