/**
 * REST অ্যাডাপ্টার — নিজস্ব সার্ভারের সাথে docs/api/API_CONTRACT.md অনুযায়ী (পাথ: ./endpoints.ts, helper: ./http.ts)।
 * AuthProvider: বাস্তবায়িত (ধাপ ১০)। HousingApi ও ImageStorage: কাঠামো, ধাপ ১৩ এ পূর্ণ হবে।
 */
import type { HousingApi } from '../interfaces/housingApi'
import type { ImageStorage } from '../interfaces/imageStorage'
import { HousingApiError } from '../interfaces/types'

export { ENDPOINTS } from './endpoints'
export { createRestAuthProvider } from './authProvider'

function notImplemented(method: string): never {
  throw new HousingApiError('NOT_IMPLEMENTED', `REST অ্যাডাপ্টার: ${method} এখনো তৈরি হয়নি`)
}

export function createRestHousingApi(_baseUrl: string): HousingApi {
  return {
    list: async () => notImplemented('list'), // GET  ENDPOINTS.housing.list
    getById: async () => notImplemented('getById'), // GET  ENDPOINTS.housing.byId
    getBySerial: async () => notImplemented('getBySerial'), // GET  ENDPOINTS.housing.bySerial
    getBySerials: async () => notImplemented('getBySerials'), // GET  ENDPOINTS.housing.bySerials
    create: async () => notImplemented('create'), // POST ENDPOINTS.housing.create
    update: async () => notImplemented('update'), // PUT  ENDPOINTS.housing.byId
    delete: async () => notImplemented('delete'), // DELETE ENDPOINTS.housing.byId
    bulkInsert: async () => notImplemented('bulkInsert'), // POST ENDPOINTS.housing.bulk
    bulkUpdateBySerial: async () => notImplemented('bulkUpdateBySerial'), // PUT  ENDPOINTS.housing.bulk
    stats: async () => notImplemented('stats'), // GET  ENDPOINTS.housing.stats
    years: async () => notImplemented('years'), // GET  ENDPOINTS.housing.years
    filterOptions: async () => notImplemented('filterOptions'), // years + stats থেকে ক্লায়েন্টে তৈরি
    uploadPhoto: async () => notImplemented('uploadPhoto'), // POST ENDPOINTS.housing.photo (multipart)
    deletePhoto: async () => notImplemented('deletePhoto'), // DELETE ENDPOINTS.housing.photo?kind=
    nextSerial: async () => notImplemented('nextSerial'), // GET  ENDPOINTS.housing.nextSerial
    changeSerial: async () => notImplemented('changeSerial'), // POST ENDPOINTS.housing.serial
    listActivity: async () => notImplemented('listActivity'), // GET  ENDPOINTS.housing.activity
    logActivity: async () => {}, // POST ENDPOINTS.housing.activity (ব্যর্থতা নীরব)
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
