import { isAcceptedMime } from './photoSpec'

export type UploadStatus = 'pending' | 'processing' | 'uploading' | 'done' | 'error' | 'skipped'

export interface UploadItem {
  id: string
  file: File
  /** object URL — শেষে revokeUploadItems() দিয়ে মুক্ত করতে হবে */
  previewUrl: string
  status: UploadStatus
  /** ০–১০০ (uploading অবস্থায়) */
  progress?: number
  message?: string
}

let seq = 0

export function createUploadItems(files: FileList | File[]): UploadItem[] {
  return Array.from(files)
    .filter((f) => !f.type || isAcceptedMime(f.type))
    .map((file) => ({
      id: `u${Date.now()}_${seq++}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending' as const,
    }))
}

export function revokeUploadItems(items: UploadItem[]): void {
  for (const it of items) URL.revokeObjectURL(it.previewUrl)
}

export const STATUS_LABEL: Record<UploadStatus, string> = {
  pending: 'অপেক্ষমাণ',
  processing: 'কম্প্রেস হচ্ছে',
  uploading: 'আপলোড হচ্ছে',
  done: 'সফল',
  error: 'ব্যর্থ',
  skipped: 'বাদ',
}

export const STATUS_CLASS: Record<UploadStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  processing: 'bg-amber-100 text-amber-800',
  uploading: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
  skipped: 'bg-slate-200 text-slate-600',
}
