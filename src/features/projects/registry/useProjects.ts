import { useSyncExternalStore } from 'react'
import type { Project, ProjectKey } from '@/backend'
import { findProject, getRegistry, subscribe, type RegistryState } from './projectsStore'

/** রেজিস্ট্রির পুরো অবস্থা (তালিকা, উৎস, মেলানো শেষ কি না) */
export function useRegistry(): RegistryState {
  return useSyncExternalStore(subscribe, getRegistry, getRegistry)
}

/** সব প্রকল্প (sort_order ক্রমে) — প্রথম আঁকায় স্ন্যাপশট/ফলব্যাক, পরে নেটওয়ার্কের তালিকা */
export function useProjects(): Project[] {
  return useRegistry().projects
}

/** একটি প্রকল্প; রেজিস্ট্রিতে না থাকলে undefined */
export function useProject(key: ProjectKey | null | undefined): Project | undefined {
  return findProject(key, useRegistry().projects)
}
