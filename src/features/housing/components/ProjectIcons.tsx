import type { SVGProps } from 'react'
import type { ProjectType } from '../backend/interfaces/types'

type IconProps = SVGProps<SVGSVGElement>

/** সেমিপাকা ঘর: ইটের দেয়াল + টিনের ঢালু ছাদ */
export function SemiPuccaHouseIcon(props: IconProps) {
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

export function ProjectIcon({ type, ...props }: IconProps & { type: ProjectType }) {
  return type === 'semi_pucca' ? <SemiPuccaHouseIcon {...props} /> : <TinHouseIcon {...props} />
}
