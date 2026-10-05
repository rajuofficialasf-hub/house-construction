import { useId, type ReactNode } from 'react'

/**
 * লেবেল + ইনপুট + সাহায্য-লেখা + ত্রুটি (aria-describedby সহ)। children একটি ফাংশন হলে id ও describedBy পায়।
 *   <Field label="নাম" error={e.name}>{(p) => <input {...p} … />}</Field>
 */
export function Field({
  label,
  help,
  error,
  required,
  children,
}: {
  label: ReactNode
  help?: ReactNode
  error?: string | null
  required?: boolean
  children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }) => ReactNode
}) {
  const id = useId()
  const helpId = `${id}-help`
  const errId = `${id}-err`
  const describedBy = [help ? helpId : null, error ? errId : null].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-describedby': describedBy, ...(error ? { 'aria-invalid': true as const } : {}) })}
      {help && (
        <p id={helpId} className="mt-1 text-xs text-slate-500">
          {help}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
