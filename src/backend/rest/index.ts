/**
 * REST অ্যাডাপ্টার — নিজস্ব সার্ভারের সাথে docs/API_CONTRACT.md v1.0 অনুযায়ী (পাথ: ./endpoints.ts, helper: ./http.ts)।
 * AuthProvider: বাস্তবায়িত (ধাপ ১০)। HousingApi, ProjectsApi ও ImageStorage: কাঠামো, ধাপ ১৩ এ পূর্ণ হবে
 * (সার্ভারের তথ্য পাওয়ার পর; প্রযুক্তি অনুমান করা হবে না)।
 */
import type { HousingApi } from '../interfaces/housingApi'
import type { ImageStorage } from '../interfaces/imageStorage'
import type { ProjectsApi } from '../interfaces/projectsApi'
import { HousingApiError } from '../interfaces/types'

export { ENDPOINTS } from './endpoints'
export { createRestAuthProvider } from './authProvider'

function notImplemented(method: string): never {
  throw new HousingApiError('NOT_IMPLEMENTED', `REST অ্যাডাপ্টার: ${method} এখনো তৈরি হয়নি`)
}

export function createRestHousingApi(_baseUrl: string): HousingApi {
  return {
    list: async () => notImplemented('list'), // GET  ENDPOINTS.projects.records(key)
    getById: async () => notImplemented('getById'), // GET  ENDPOINTS.records.byId
    getBySerial: async () => notImplemented('getBySerial'), // GET  ENDPOINTS.projects.recordBySerial
    getBySerials: async () => notImplemented('getBySerials'), // GET  ENDPOINTS.projects.recordsBySerials
    create: async () => notImplemented('create'), // POST ENDPOINTS.projects.records(key)
    update: async () => notImplemented('update'), // PATCH ENDPOINTS.records.byId
    delete: async () => notImplemented('delete'), // DELETE ENDPOINTS.records.byId
    bulkInsert: async () => notImplemented('bulkInsert'), // POST ENDPOINTS.projects.recordsBulk
    bulkUpdateBySerial: async () => notImplemented('bulkUpdateBySerial'), // PUT  ENDPOINTS.projects.recordsBulk
    stats: async () => notImplemented('stats'), // GET  ENDPOINTS.projects.stats(key) ?light=1
    years: async () => notImplemented('years'), // GET  ENDPOINTS.projects.years(key)
    filterOptions: async () => notImplemented('filterOptions'), // years + stats থেকে ক্লায়েন্টে তৈরি
    uploadPhoto: async () => notImplemented('uploadPhoto'), // PUT  ENDPOINTS.records.photo(id, slot) (multipart)
    deletePhoto: async () => notImplemented('deletePhoto'), // DELETE ENDPOINTS.records.photo(id, slot)
    nextSerial: async () => notImplemented('nextSerial'), // GET  ENDPOINTS.projects.nextSerial(key)
    changeSerial: async () => notImplemented('changeSerial'), // POST ENDPOINTS.records.serial
    getPrivate: async () => notImplemented('getPrivate'), // GET  ENDPOINTS.records.private
    setPrivate: async () => notImplemented('setPrivate'), // PUT  ENDPOINTS.records.private
    getPrivateMany: async () => notImplemented('getPrivateMany'), // POST ENDPOINTS.projects.recordsPrivate(key) { ids }
    listActivity: async () => notImplemented('listActivity'), // GET  ENDPOINTS.activity
    logActivity: async () => {}, // POST ENDPOINTS.activity (ব্যর্থতা নীরব)
  }
}

export function createRestProjectsApi(_baseUrl: string): ProjectsApi {
  return {
    backendMode: async () => 'full', // REST সার্ভার সবসময় পূর্ণ চুক্তি মানবে
    list: async () => notImplemented('projects.list'), // GET  ENDPOINTS.projects.list ?include=fields&drafts=1
    get: async () => notImplemented('projects.get'), // GET  ENDPOINTS.projects.byKey
    overview: async () => notImplemented('projects.overview'), // GET  ENDPOINTS.projects.overview
    create: async () => notImplemented('projects.create'), // POST ENDPOINTS.projects.list
    update: async () => notImplemented('projects.update'), // PATCH ENDPOINTS.projects.byKey (If-Match)
    delete: async () => notImplemented('projects.delete'), // DELETE ENDPOINTS.projects.byKey
    reorder: async () => notImplemented('projects.reorder'), // PUT  ENDPOINTS.projects.order
    createField: async () => notImplemented('projects.createField'), // POST ENDPOINTS.projects.fields
    updateField: async () => notImplemented('projects.updateField'), // PATCH ENDPOINTS.fields.byId
    deleteField: async () => notImplemented('projects.deleteField'), // DELETE ENDPOINTS.fields.byId
    reorderFields: async () => notImplemented('projects.reorderFields'), // PUT  ENDPOINTS.projects.fieldsOrder
    fieldUsage: async () => notImplemented('projects.fieldUsage'), // GET  ENDPOINTS.projects.fieldUsage
    renameFieldValue: async () => notImplemented('projects.renameFieldValue'), // POST ENDPOINTS.projects.fieldRenameValue
  }
}

/**
 * REST মোডে ছবি রাখা/মোছা HousingApi.uploadPhoto/deletePhoto এর endpoint দিয়ে হয়;
 * এই ইন্টারফেস শুধু URL গণনার জন্য থাকবে (publicUrl/pathFromUrl)।
 */
export function createRestImageStorage(_baseUrl: string): ImageStorage {
  return {
    upload: async () => notImplemented('upload'),
    delete: async () => notImplemented('delete'),
    move: async () => notImplemented('move'),
    publicUrl: () => notImplemented('publicUrl'),
    pathFromUrl: () => null,
  }
}
