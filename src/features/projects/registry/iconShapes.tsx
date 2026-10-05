import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/** প্রকল্পের আইকনের SVG আকার (৬৪×৬৪, currentColor) — তালিকা ও key: ./icons.ts */

/** সেমিপাকা ঘর: ইটের দেয়াল + টিনের ঢালু ছাদ */
export function HouseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      {/* ছাদ */}
      <path d="M6 30 32 10l26 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 28v-4l20-14 20 14v4" fill="currentColor" opacity="0.15" />
      {/* দেয়াল */}
      <rect x="14" y="30" width="36" height="24" rx="1.5" stroke="currentColor" strokeWidth="3" />
      {/* ইটের রেখা */}
      <path d="M14 38h36M14 46h36M26 30v8M38 38v8M26 46v8" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      {/* দরজা */}
      <rect x="28" y="40" width="8" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

/** টিনের ঘর: ঢেউটিনের দেয়াল ও ছাদ */
export function TinHouseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      {/* ছাদ */}
      <path d="M6 30 32 12l26 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 29c3-2 5-2 8 0s5 2 8 0 5-2 8 0 5 2 8 0 5-2 8 0" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      {/* দেয়াল */}
      <rect x="14" y="30" width="36" height="24" rx="1.5" stroke="currentColor" strokeWidth="3" />
      {/* ঢেউটিনের খাড়া রেখা */}
      <path d="M20 30v24M26 30v24M38 30v24M44 30v24" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      {/* দরজা */}
      <rect x="29" y="40" width="7" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

/** গরু: পাশ থেকে দেহ, শিং, চার পা */
export function CowIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M14 26h30c5 0 8 3 8 8v6c0 3-2 5-5 5H17c-3 0-5-2-5-5v-12c0-1 1-2 2-2Z" />
      <path d="M52 30c3 0 6-2 6-6v-2h-8" />
      <path d="M54 22c1-3 3-4 5-4M50 22c-1-3 0-5 2-6" strokeWidth="2" />
      <path d="M18 45v9M26 45v9M38 45v9M46 45v9" />
      <path d="M12 30c-3 1-5 4-5 8" strokeWidth="2" />
      <circle cx="30" cy="34" r="3" fill="currentColor" opacity="0.25" stroke="none" />
      <circle cx="40" cy="31" r="2" fill="currentColor" opacity="0.25" stroke="none" />
    </svg>
  )
}

/** ছাগল: ছোট দেহ, পেছনে বাঁকা শিং, দাড়ি */
export function GoatIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M16 30h22c5 0 8 3 8 7v3c0 2-2 4-4 4H18c-3 0-5-2-5-5v-6c0-2 1-3 3-3Z" />
      <path d="M44 31l5-9c1-2 4-3 6-1l2 3-4 4h-3" />
      <path d="M51 21c-1-5 2-9 6-9" strokeWidth="2" />
      <path d="M55 27v5" strokeWidth="2" />
      <path d="M20 44v10M27 44v10M36 44v10M42 44v10" />
      <path d="M13 32l-4-3" strokeWidth="2" />
    </svg>
  )
}

/** দোকান: শামিয়ানা, কাউন্টার, দরজা */
export function ShopIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M10 22 14 10h36l4 12" />
      <path d="M10 22c0 4 3 6 6.5 6S23 26 23 22c0 4 3 6 6.5 6S36 26 36 22c0 4 3 6 6.5 6S49 26 49 22c0 4 2 6 5 6" />
      <path d="M14 28v26h36V28" />
      <rect x="20" y="36" width="10" height="18" rx="1" />
      <rect x="35" y="36" width="10" height="8" rx="1" fill="currentColor" opacity="0.15" />
    </svg>
  )
}

/** সেলাই মেশিন: বাহু, সুঁই, চাকা, পাটাতন */
export function SewingMachineIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8 50h48" />
      <path d="M14 50V22c0-4 3-7 7-7h24c4 0 7 3 7 7v6H26v8" />
      <path d="M26 36h-6v6" />
      <path d="M23 42v6" strokeWidth="2" />
      <circle cx="48" cy="38" r="5" />
      <path d="M48 28v5" strokeWidth="2" />
      <path d="M30 22h14" strokeWidth="2" opacity="0.6" />
    </svg>
  )
}

/** টুলস (দক্ষতা): রেঞ্চ ও স্ক্রুড্রাইভার আড়াআড়ি */
export function ToolsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M40 10a10 10 0 0 0-9 14L12 43a4 4 0 0 0 6 6l19-19a10 10 0 0 0 14-9l-6 4-5-1-1-5 6-4c-2-3-3-5-5-5Z" />
      <path d="m36 40 10 10a4 4 0 0 0 6-6L42 34" />
      <path d="M14 14l8 8M10 18l4-8 4 4" strokeWidth="2" />
    </svg>
  )
}

/** কয়েন: টাকার স্তূপ */
export function CoinsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <ellipse cx="24" cy="18" rx="14" ry="6" />
      <path d="M10 18v8c0 3 6 6 14 6s14-3 14-6v-8" />
      <path d="M10 26v8c0 3 6 6 14 6 3 0 5 0 7-1" />
      <ellipse cx="42" cy="38" rx="14" ry="6" />
      <path d="M28 38v8c0 3 6 6 14 6s14-3 14-6v-8" />
      <path d="M38 37h8" strokeWidth="2" opacity="0.6" />
    </svg>
  )
}

/** হাত-হৃদয় (সাহায্য): হাতের তালুর উপর হৃদয় */
export function HandsHeartIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M32 30s-12-7-12-15a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 8-12 15-12 15Z" fill="currentColor" fillOpacity="0.15" />
      <path d="M6 44h8l10 6h14l14-8c2-1 2-4 0-5-1-1-3-1-4 0l-9 5H28" />
      <path d="M14 38h10c2 0 4 2 4 4h8" />
      <path d="M6 38v14" />
    </svg>
  )
}

/** মানুষ (উপকারভোগী): তিনজন */
export function UsersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="32" cy="20" r="8" />
      <path d="M18 52c0-8 6-14 14-14s14 6 14 14" />
      <circle cx="14" cy="26" r="5" strokeWidth="2.5" />
      <path d="M4 50c0-6 4-10 10-10 2 0 4 1 5 2" strokeWidth="2.5" />
      <circle cx="50" cy="26" r="5" strokeWidth="2.5" />
      <path d="M60 50c0-6-4-10-10-10-2 0-4 1-5 2" strokeWidth="2.5" />
    </svg>
  )
}

/** fallback: অচেনা key — একটি তারকা-ব্যাজ */
export function FallbackIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="32" cy="32" r="22" />
      <path d="m32 20 3.5 7.5 8 1-6 5.5 1.5 8L32 38l-7 4 1.5-8-6-5.5 8-1Z" fill="currentColor" fillOpacity="0.15" />
    </svg>
  )
}
