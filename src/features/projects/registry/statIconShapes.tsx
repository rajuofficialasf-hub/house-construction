import type { SVGProps } from 'react'

/** পরিসংখ্যান কার্ডের ছোট আইকন (২৪×২৪, রেখা) — তালিকা ও key: ./statIcons.ts। প্রথম চারটি StatCards.tsx এর হুবহু। */
type P = SVGProps<SVGSVGElement>
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function UsersStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.5A5 5 0 0 1 22 19" />
    </svg>
  )
}

export function MapStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </svg>
  )
}

export function PinStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

export function GridStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function HouseStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  )
}

export function CoinsStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
      <path d="M9 17c-3.3 0-6-1.3-6-3" />
      <ellipse cx="15" cy="15" rx="6" ry="3" />
      <path d="M9 15v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-3" />
    </svg>
  )
}

export function TagsStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  )
}

export function CalendarStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

export function ChartStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}

export function HeartStatIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </svg>
  )
}
