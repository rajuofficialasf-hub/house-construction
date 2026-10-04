import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * ০ থেকে target পর্যন্ত count-up (ease-out cubic)। target বদলালে বর্তমান মান থেকে নতুন মানে যায়।
 * reduced-motion থাকলে সরাসরি target (এক ফ্রেমে)। SSR এ ০ রেন্ডার হয়, ক্লায়েন্টে অ্যানিমেট হয়।
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0)
  const currentRef = useRef(0)

  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') return
    const from = currentRef.current
    const apply = (v: number) => {
      currentRef.current = v
      setValue(v)
    }
    if (prefersReducedMotion() || from === target) {
      const id = requestAnimationFrame(() => apply(target))
      return () => cancelAnimationFrame(id)
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      apply(Math.round(from + (target - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return value
}
