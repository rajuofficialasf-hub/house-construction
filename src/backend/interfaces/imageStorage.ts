import type { UploadResult, UploadTarget } from './types'

/**
 * ছবি স্টোরেজের নিম্নস্তরের ইন্টারফেস: শুধু ফাইল রাখা/মোছা/URL।
 * রেকর্ডের url কলাম আপডেট এর কাজ নয়; সেটা HousingApi.uploadPhoto করে (ভেতরে এটি ব্যবহার করে)।
 * ফাইলের পাথ সিরিয়াল দিয়ে নির্ধারিত (utils/imagePath.ts), তাই upload এ ফাইলনাম নেওয়া হয় না।
 * একই target এ পুনরায় upload করলে আগের ফাইল প্রতিস্থাপিত হবে।
 */
export interface ImageStorage {
  upload(file: Blob, target: UploadTarget): Promise<UploadResult>
  delete(paths: string[]): Promise<void>
  /** ফাইল সরানো (সিরিয়াল বদলে); উৎস না থাকলে NOT_FOUND */
  move(fromPath: string, toPath: string): Promise<UploadResult>
  /** পাবলিক URL; সিঙ্ক্রোনাস, কারণ পাথ থেকে সরাসরি গণনাযোগ্য */
  publicUrl(path: string): string
  /** পাবলিক URL থেকে স্টোরেজ পাথ; এই স্টোরেজের URL না হলে null */
  pathFromUrl(url: string): string | null
}
