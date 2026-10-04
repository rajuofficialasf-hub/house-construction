/** বাংলা অঙ্ক সহ টেক্সট থেকে পূর্ণসংখ্যা (কমা বাদ) */
export function bnInt(text: string | null | undefined): number {
  const ascii = (text ?? '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/[,\s]/g, '')
  const m = ascii.match(/-?\d+/)
  return m ? Number(m[0]) : Number.NaN
}

/** "১২ উপজেলায় ১২ টি ঘর" ধরনের টেক্সট থেকে সব সংখ্যা */
export function bnInts(text: string | null | undefined): number[] {
  const ascii = (text ?? '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
  return [...ascii.matchAll(/\d+/g)].map((m) => Number(m[0]))
}
