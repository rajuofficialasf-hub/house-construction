import { lt, t } from '@/i18n'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import type { Project } from '@/backend'
import { childrenOf, isPublicProject, projectPath, topLevelProjects, useProjects } from '@/features/projects/registry'

/**
 * হেডারের "প্রকল্পসমূহ ▾" (পরিকল্পনা §৫.১৪) — রেজিস্ট্রি থেকে: শীর্ষ-স্তরের প্রকল্প (গ্রুপ ও একক), গ্রুপের নিচে তার উপ-প্রকল্প।
 * ড্রপডাউন, কারণ লম্বা বাংলা নামগুলো ৭৬৮px এ পাশাপাশি ধরে না। খসড়া (শুধু এডমিন) মেনুতে দেখায় না।
 */
interface Item {
  to: string
  label: string
  /** ০ = শীর্ষ-স্তর, ১ = গ্রুপের উপ-প্রকল্প */
  depth: 0 | 1
}

function menuItems(projects: Project[]): Item[] {
  const shown = (p: Project) => isPublicProject(p, projects)
  return topLevelProjects(projects)
    .filter(shown)
    .flatMap((p) => [
      { to: projectPath(p, projects), label: lt(p, 'name'), depth: 0 as const },
      ...(p.is_group ? childrenOf(p.key, projects).filter(shown) : []).map((c) => ({
        to: projectPath(c, projects),
        label: lt(c, 'name'),
        depth: 1 as const,
      })),
    ])
}

const isUnder = (path: string, to: string) => path === to || path.startsWith(`${to}/`)

/** ডেস্কটপ (md+): বোতাম + ড্রপডাউন; বাইরে ক্লিক, Esc বা লিংকে চাপলে বন্ধ */
export function ProjectsMenu() {
  const projects = useProjects()
  const items = menuItems(projects)
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const active = items.some((i) => isUnder(pathname, i.to))

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!items.length) return null
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          active ? 'bg-brand-700 text-white' : 'text-brand-50/90 hover:bg-brand-700/60 hover:text-white',
        ].join(' ')}
      >
        {t('প্রকল্পসমূহ')}
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div id={menuId} className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-white py-2 text-slate-800 shadow-lg ring-1 ring-black/5">
          {items.map((i) => (
            <Link
              key={i.to}
              to={i.to}
              onClick={() => setOpen(false)}
              aria-current={pathname === i.to ? 'page' : undefined}
              className={[
                'block px-4 py-2 text-sm hover:bg-brand-50 hover:text-brand-800',
                i.depth === 1 ? 'pl-8' : 'font-semibold',
                isUnder(pathname, i.to) ? 'text-brand-700' : i.depth === 1 ? 'text-slate-600' : '',
              ].join(' ')}
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/** মোবাইল মেনুর ভেতরে: শিরোনাম + একই তালিকা (ড্রপডাউন ছাড়া) */
export function MobileProjectLinks({ onNavigate }: { onNavigate: () => void }) {
  const projects = useProjects()
  const items = menuItems(projects)
  const { pathname } = useLocation()
  if (!items.length) return null
  return (
    <div className="mt-1 border-t border-brand-700/70 pt-2">
      <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-brand-50/60 uppercase">{t('প্রকল্পসমূহ')}</p>
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          onClick={onNavigate}
          aria-current={pathname === i.to ? 'page' : undefined}
          className={[
            'block rounded-md py-2 text-sm font-medium transition-colors',
            i.depth === 1 ? 'pr-3 pl-7' : 'px-3',
            pathname === i.to ? 'bg-brand-700 text-white' : 'text-brand-50/90 hover:bg-brand-700/60 hover:text-white',
          ].join(' ')}
        >
          {i.label}
        </Link>
      ))}
    </div>
  )
}
