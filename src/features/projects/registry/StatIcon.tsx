import type { SVGProps } from 'react'
import { FALLBACK_STAT_ICON, STAT_ICONS, type StatIconKey } from './statIcons'

/** কার্ডের `icon` key দিয়ে পরিসংখ্যান-আইকন (statIcons.ts); অচেনা হলে মানুষ-আইকন */
export function StatIcon({ icon, ...props }: SVGProps<SVGSVGElement> & { icon: string | null | undefined }) {
  const Icon = icon && icon in STAT_ICONS ? STAT_ICONS[icon as StatIconKey].Icon : FALLBACK_STAT_ICON
  return <Icon {...props} />
}
