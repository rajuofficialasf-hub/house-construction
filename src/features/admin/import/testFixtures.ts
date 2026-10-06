import type { ProjectField } from '@/backend'

/** A project field for tests: an active public field with every option off, plus the given values. */
export function projectField(over: Partial<ProjectField> & Pick<ProjectField, 'key' | 'label_bn' | 'type'>): ProjectField {
  return {
    id: `id-${over.key}`,
    project_key: 'demo',
    label_en: '',
    help_bn: '',
    help_en: '',
    options: [],
    required: false,
    visibility: 'public',
    show_in_table: false,
    show_in_card: false,
    show_in_detail: true,
    filterable: false,
    searchable: false,
    fill_down: false,
    max_length: null,
    min_value: null,
    max_value: null,
    import_aliases: [],
    sort_order: 10,
    is_active: true,
    created_at: '2026-10-06T00:00:00Z',
    updated_at: '2026-10-06T00:00:00Z',
    ...over,
  }
}
