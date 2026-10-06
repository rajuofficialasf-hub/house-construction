/**
 * REST ProjectsApi — নিজস্ব সার্ভারের /api/v1/projects… ও /fields… রাউট (docs/api/PROJECTS_API_CONTRACT.md §৪.১–৪.২)।
 * সার্ভারের উত্তর UI-র টাইপের আকারেই আসে, তাই এখানে কোনো ম্যাপিং নেই; অনুমতি, গার্ড ও খসড়া লুকানো সার্ভারে।
 */
import type { ProjectsApi } from '../interfaces/projectsApi'
import type { FieldUsage, Project, ProjectField, ProjectOverview } from '../interfaces/types'
import { ENDPOINTS } from './endpoints'
import { restRequest } from './http'

export function createRestProjectsApi(baseUrl: string): ProjectsApi {
  /** Calls the server and returns the `data` of its `{ data }` answer. */
  const call = async <T>(path: string, opts?: Parameters<typeof restRequest>[2]) => (await restRequest<{ data: T }>(baseUrl, path, opts)).data
  const none = async (path: string, opts: Parameters<typeof restRequest>[2]) => {
    await restRequest<void>(baseUrl, path, opts)
  }
  const draftsQuery = (includeDrafts?: boolean) => new URLSearchParams(includeDrafts ? { drafts: '1' } : {})

  return {
    backendMode: async () => 'full',
    list: (opts = {}) => {
      const query = draftsQuery(opts.includeDrafts)
      query.set('include', 'fields')
      return call<Project[]>(ENDPOINTS.projects.list(query))
    },
    get: (key) => call<Project>(ENDPOINTS.projects.byKey(key)),
    overview: (opts = {}) => call<ProjectOverview>(ENDPOINTS.projects.overview(draftsQuery(opts.includeDrafts))),

    create: (input, fields = []) => call<Project>(ENDPOINTS.projects.list(), { method: 'POST', body: { project: input, fields } }),
    // If-Match থাকলে সার্ভার মেলায়: অন্য কেউ এর মধ্যে বদলালে 409 CONFLICT (দুই এডমিনের একসাথে এডিট)
    update: (key, patch, opts = {}) =>
      call<Project>(ENDPOINTS.projects.byKey(key), {
        method: 'PATCH',
        body: patch,
        headers: opts.expectedUpdatedAt ? { 'if-match': opts.expectedUpdatedAt } : undefined,
      }),
    uploadCover(key, file) {
      // সার্ভার ছবিটি নিজেই WebP করে ও ছোট কপি বানায়, তাই একটি অংশই যথেষ্ট
      const form = new FormData()
      form.append('photo', file, 'cover.webp')
      return call<Project>(ENDPOINTS.projects.cover(key), { method: 'PUT', formData: form })
    },
    deleteCover: (key) => call<Project>(ENDPOINTS.projects.cover(key), { method: 'DELETE' }),
    delete: (key) => none(ENDPOINTS.projects.byKey(key), { method: 'DELETE' }),
    reorder: (keys) => none(ENDPOINTS.projects.order(), { method: 'PUT', body: { keys } }),

    createField: (projectKey, input) => call<ProjectField>(ENDPOINTS.projects.fields(projectKey), { method: 'POST', body: input }),
    updateField: (id, patch) => call<ProjectField>(ENDPOINTS.fields.byId(id), { method: 'PATCH', body: patch }),
    deleteField: (id) => none(ENDPOINTS.fields.byId(id), { method: 'DELETE' }),
    reorderFields: (projectKey, ids) => none(ENDPOINTS.projects.fieldsOrder(projectKey), { method: 'PUT', body: { ids } }),
    fieldUsage: (projectKey, fieldKey) => call<FieldUsage>(ENDPOINTS.projects.fieldUsage(projectKey, fieldKey)),
    renameFieldValue: async (projectKey, fieldKey, from, to) =>
      (await call<{ updated: number }>(ENDPOINTS.projects.fieldRenameValue(projectKey, fieldKey), { method: 'POST', body: { from, to } })).updated,
  }
}
