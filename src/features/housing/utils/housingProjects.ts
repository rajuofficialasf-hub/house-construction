/**
 * ঘর নির্মাণ পেইজগুলোর প্রকল্প-সহায়ক — প্রকল্প-রেজিস্ট্রি থেকে (M-ধাপ ৫ক-এ হাতে লেখা PROJECT_META/PROJECT_LIST এর জায়গায়)।
 * নাম/বর্ণনা দেখাতে lt(project, 'name') ব্যবহার করুন (t() নয়)।
 */
import type { Project, ProjectKey } from '@/backend'
import { childrenOf, housingProjects, leafProjects, useProjects, HOUSING_GROUP_KEY } from '@/features/projects/registry'

export { projectPath } from '@/features/projects/registry'

/**
 * এডমিনের রেকর্ড-পাতা: /admin/records/{key}[/{rest}] — এডমিন URL এ slug নয়, স্থায়ী key (পরিকল্পনা §৪.২;
 * slug বদলালেও বুকমার্ক ভাঙে না, import/photos এর মতো স্থির শব্দের সাথে সংঘর্ষ নেই)।
 */
export function adminPath(key: ProjectKey, rest = ''): string {
  return `/admin/records/${encodeURIComponent(key)}${rest ? `/${rest}` : ''}`
}

/** ঘর নির্মাণের উপ-প্রকল্পগুলো (সেমিপাকা, টিন …) — sort_order ক্রমে */
export function useHousingProjects(): Project[] {
  return housingProjects(useProjects())
}

/** একটি গ্রুপের উপ-প্রকল্প (না দিলে ঘর নির্মাণ) — গ্রুপ ল্যান্ডিং, সাবনেভ */
export function useGroupChildren(groupKey: ProjectKey = HOUSING_GROUP_KEY): Project[] {
  return childrenOf(groupKey, useProjects())
}

/** এডমিন URL-এর key থেকে ঘর নির্মাণের উপ-প্রকল্প; না মিললে undefined (তখন পেইজ 404 দেখায়) */
export function useHousingProjectByKey(key: string | undefined): Project | undefined {
  const list = useHousingProjects()
  return key ? list.find((p) => p.key === key) : undefined
}

/**
 * রেকর্ড রাখা যায় এমন সব প্রকল্প (গ্রুপ বাদ; এডমিনের রেজিস্ট্রিতে খসড়াও) — আগে ঘর নির্মাণের উপ-প্রকল্প, তারপর বাকিগুলো
 * (M-ধাপ ১০: রেকর্ড-পাতা, ফর্ম আর এডমিন মেনু এখন যেকোনো প্রকল্পের)।
 */
export function useRecordProjects(): Project[] {
  const all = useProjects()
  const housing = housingProjects(all)
  return [...housing, ...leafProjects(all).filter((p) => !housing.includes(p))]
}

/** এডমিন URL-এর key থেকে রেকর্ডের প্রকল্প (যেকোনো, গ্রুপ নয়); না মিললে undefined (তখন পেইজ 404) */
export function useRecordProjectByKey(key: string | undefined): Project | undefined {
  const list = useRecordProjects()
  return key ? list.find((p) => p.key === key) : undefined
}
