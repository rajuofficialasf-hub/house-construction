/**
 * প্রকল্পের রঙের নির্দিষ্ট তালিকা (পর্ব ২): ডাটাবেসের `projects.accent` এখানের একটি key — কাঁচা CSS কখনো ডাটাবেস থেকে নয়।
 * Tailwind ক্লাস পুরো লেখা থাকতে হবে (বিল্ড সোর্স থেকে ক্লাস খোঁজে), তাই প্রতিটি রং আলাদা করে লেখা।
 * 'brand' = সাইটের সবুজ (এখনকার ঘর নির্মাণের কার্ড হুবহু এই ক্লাসগুলো ব্যবহার করে)।
 */
export interface Accent {
  label_bn: string
  label_en: string
  /** হালকা পটভূমি + গাঢ় লেখা (আইকনের বাক্স, টাইল) */
  soft: string
  /** গাঢ় পটভূমি + সাদা লেখা (প্রধান টাইল) */
  solid: string
  /** শুধু লেখার রং */
  text: string
  /** বোতামের বর্ডার ও লেখা (hover-এ ভরাট) */
  outline: string
}

export const ACCENTS = {
  brand: {
    label_bn: 'সবুজ (সাইটের রং)',
    label_en: 'Green (site colour)',
    soft: 'bg-brand-50 text-brand-700',
    solid: 'bg-brand-700 text-white',
    text: 'text-brand-700',
    outline: 'border-brand-600 text-brand-700 hover:bg-brand-600 hover:text-white',
  },
  teal: {
    label_bn: 'নীলচে সবুজ',
    label_en: 'Teal',
    soft: 'bg-teal-50 text-teal-700',
    solid: 'bg-teal-700 text-white',
    text: 'text-teal-700',
    outline: 'border-teal-600 text-teal-700 hover:bg-teal-600 hover:text-white',
  },
  sky: {
    label_bn: 'আকাশি',
    label_en: 'Sky blue',
    soft: 'bg-sky-50 text-sky-700',
    solid: 'bg-sky-700 text-white',
    text: 'text-sky-700',
    outline: 'border-sky-600 text-sky-700 hover:bg-sky-600 hover:text-white',
  },
  indigo: {
    label_bn: 'নীল',
    label_en: 'Indigo',
    soft: 'bg-indigo-50 text-indigo-700',
    solid: 'bg-indigo-700 text-white',
    text: 'text-indigo-700',
    outline: 'border-indigo-600 text-indigo-700 hover:bg-indigo-600 hover:text-white',
  },
  amber: {
    label_bn: 'সোনালি',
    label_en: 'Amber',
    soft: 'bg-amber-50 text-amber-800',
    solid: 'bg-amber-600 text-white',
    text: 'text-amber-800',
    outline: 'border-amber-600 text-amber-800 hover:bg-amber-600 hover:text-white',
  },
  rose: {
    label_bn: 'গোলাপি',
    label_en: 'Rose',
    soft: 'bg-rose-50 text-rose-700',
    solid: 'bg-rose-700 text-white',
    text: 'text-rose-700',
    outline: 'border-rose-600 text-rose-700 hover:bg-rose-600 hover:text-white',
  },
} as const satisfies Record<string, Accent>

/** ডাটাবেসের `accent` key দিয়ে রং; অচেনা হলে 'brand' */
export function accentOf(key: string | null | undefined): Accent {
  return key && key in ACCENTS ? ACCENTS[key as keyof typeof ACCENTS] : ACCENTS.brand
}
