import type { SVGProps } from 'react'
import { FALLBACK_ICON, PROJECT_ICONS, type ProjectIconKey } from './icons'

/** ডাটাবেসের `projects.icon` key দিয়ে আইকন (icons.tsx এর তালিকা); অচেনা হলে fallback */
export function ProjectIcon({ icon, ...props }: SVGProps<SVGSVGElement> & { icon: string | null | undefined }) {
  const Icon = icon && icon in PROJECT_ICONS ? PROJECT_ICONS[icon as ProjectIconKey].Icon : FALLBACK_ICON
  return <Icon {...props} />
}
