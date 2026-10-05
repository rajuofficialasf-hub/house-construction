import type { ListParams, ProjectType } from '../../../backend/interfaces/types'
import type { ListState } from '../hooks/useHousingList'

/**
 * HousingListPage → (Outlet) → HousingDetailPage এ পাঠানো context।
 * ডিটেইল ভিউ এতে বর্তমান ফিল্টার করা পেইজের ক্রম পায় (আগের/পরের নেভিগেশনের জন্য)।
 */
export interface ListOutletContext {
  projectType: ProjectType
  /** বর্তমান তালিকার params (project_type, ফিল্টার, page, sort) */
  params: ListParams
  list: ListState
  page: number
}
