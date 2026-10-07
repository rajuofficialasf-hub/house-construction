import { t } from '@/i18n'
import type { ReactNode } from 'react'
import type { Project } from '@/backend'
import { isPublicProject, useProjects } from '@/features/projects/registry'

/** খসড়া প্রকল্পের পেইজের উপরে হলুদ ব্যানার — খসড়া রাউট শুধু এডমিনের রেজিস্ট্রিতে থাকে (সার্ভার দর্শককে খসড়া দেয় না), তাই এটি শুধু এডমিন দেখেন */
export function DraftBanner() {
  return (
    <div role="status" className="border-b border-amber-300 bg-amber-100 text-amber-900">
      <p className="container-page py-2 text-sm font-semibold">{t('খসড়া — শুধু এডমিন দেখছেন')}</p>
    </div>
  )
}

/** প্রকল্পের প্রতিটি পাবলিক পেইজের মোড়ক: প্রকল্পটি পাবলিক না হলে (খসড়া, বা গ্রুপ অপ্রকাশিত) DraftBanner */
export function ProjectFrame({ project, children }: { project: Project; children: ReactNode }) {
  const projects = useProjects()
  const draft = !isPublicProject(project, projects)
  return (
    <>
      {draft && <DraftBanner />}
      {children}
    </>
  )
}
