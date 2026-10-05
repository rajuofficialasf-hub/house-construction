import type { ListParams, Project, ProjectType } from '../../../backend/interfaces/types'
import type { ListState } from '../hooks/useHousingList'

/**
 * HousingListPage → (Outlet) → HousingDetailPage এ পাঠানো context।
 * ডিটেইল ভিউ এতে বর্তমান ফিল্টার করা পেইজের ক্রম পায় (আগের/পরের নেভিগেশনের জন্য)।
 */
export interface ListOutletContext {
  /** পুরো প্রকল্প (রেজিস্ট্রি থেকে; M-ধাপ ৬) — নাম, ছবি-মোড, ফিল্ড */
  project: Project
  /** = project.key */
  projectType: ProjectType
  /** বর্তমান তালিকার params (project_type, ফিল্টার, page, sort) */
  params: ListParams
  list: ListState
  page: number
}
