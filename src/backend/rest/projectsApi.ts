/**
 * REST ProjectsApi — নিজস্ব সার্ভারের /api/v1/projects… ও /fields… রাউট (docs/api/PROJECTS_API_CONTRACT.md §৪.১–৪.২)।
 * সার্ভারের উত্তর UI-র টাইপের আকারেই আসে, তাই এখানে কোনো ম্যাপিং নেই; অনুমতি, গার্ড ও খসড়া লুকানো সার্ভারে।
 */
import type { ProjectsApi } from '../interfaces/projectsApi'
import type { FieldUsage, Project, ProjectField, ProjectOverview } from '../interfaces/types'
import { ENDPOINTS } from './endpoints'
import { queryOf, restData, restRequest, type RestRequestOptions } from './http'

export function createRestProjectsApi(baseUrl: string): ProjectsApi {
  const call = <T>(path: string, opts?: RestRequestOptions) => restData<T>(baseUrl, path, opts)
  const none = async (path: string, opts: RestRequestOptions) => {
    await restRequest<void>(baseUrl, path, opts)
  }
  const drafts = (includeDrafts?: boolean) => (includeDrafts ? '1' : undefined)

  return {
    backendMode: async () => 'full',
    list: (opts = {}) => call<Project[]>(ENDPOINTS.projects.list(queryOf({ drafts: drafts(opts.includeDrafts), include: 'fields' }))),
    get: (key) => call<Project>(ENDPOINTS.projects.byKey(key)),
    overview: (opts = {}) => call<ProjectOverview>(ENDPOINTS.projects.overview(queryOf({ drafts: drafts(opts.includeDrafts) }))),

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
