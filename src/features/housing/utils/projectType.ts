import type { ProjectType } from '../../../backend/interfaces/types'

export interface ProjectMeta {
  type: ProjectType
  /** বাংলা শিরোনাম */
  title: string
  /** এক-দুই লাইনের বর্ণনা (কার্ড/ল্যান্ডিং) */
  description: string
  /** URL অংশ, যেমন /housing/semi-pucca */
  slug: string
  /** ছবির ফাইলনামের প্রিফিক্স, যেমন semi_0001_prev.jpg */
  filePrefix: string
}

export const PROJECT_META: Record<ProjectType, ProjectMeta> = {
  semi_pucca: {
    type: 'semi_pucca',
    title: 'সেমিপাকা ঘর নির্মাণ',
    description: 'ইটের দেয়াল ও টিনের ছাউনিতে টেকসই, নিরাপদ ঘর — দীর্ঘমেয়াদি বাসস্থানের সমাধান।',
    slug: 'semi-pucca',
    filePrefix: 'semi',
  },
  tin: {
    type: 'tin',
    title: 'টিনের ঘর নির্মাণ',
    description: 'দ্রুত ও স্বল্প ব্যয়ে নির্মিত টিনের ঘর — জরুরি প্রয়োজনে মাথা গোঁজার ঠাঁই।',
    slug: 'tin',
    filePrefix: 'tin',
  },
}

export const PROJECT_LIST: ProjectMeta[] = [PROJECT_META.semi_pucca, PROJECT_META.tin]

export function projectPath(type: ProjectType): string {
  return `/housing/${PROJECT_META[type].slug}`
}

export function projectFromSlug(slug: string | undefined): ProjectType | null {
  const found = PROJECT_LIST.find((p) => p.slug === slug)
  return found ? found.type : null
}
