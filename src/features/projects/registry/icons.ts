/**
 * প্রকল্পের আইকন-রেজিস্ট্রি (পর্ব ২): ডাটাবেসের `projects.icon` এখানের একটি key।
 * এডমিন প্যানেল এই তালিকা থেকেই বাছাই দেখায়; অচেনা key হলে fallback আইকন। কাঁচা SVG/URL কখনো ডাটাবেস থেকে নয়।
 * আকারগুলো ./iconShapes.tsx এ; রং আসে চারপাশের লেখার রং থেকে (accents.ts)।
 */
import {
  HouseIcon,
  TinHouseIcon,
  CowIcon,
  GoatIcon,
  ShopIcon,
  SewingMachineIcon,
  ToolsIcon,
  CoinsIcon,
  HandsHeartIcon,
  UsersIcon,
  FallbackIcon,
} from './iconShapes'

/** key → আইকন ও বাছাইয়ের নাম (এডমিন প্যানেলের ড্রপডাউন) */
export const PROJECT_ICONS = {
  house: { label_bn: 'বাড়ি (সেমিপাকা)', label_en: 'House', Icon: HouseIcon },
  'tin-house': { label_bn: 'টিনের ঘর', label_en: 'Tin-shed house', Icon: TinHouseIcon },
  cow: { label_bn: 'গরু', label_en: 'Cow', Icon: CowIcon },
  goat: { label_bn: 'ছাগল', label_en: 'Goat', Icon: GoatIcon },
  shop: { label_bn: 'দোকান', label_en: 'Shop', Icon: ShopIcon },
  'sewing-machine': { label_bn: 'সেলাই মেশিন', label_en: 'Sewing machine', Icon: SewingMachineIcon },
  tools: { label_bn: 'টুলস (দক্ষতা)', label_en: 'Tools', Icon: ToolsIcon },
  coins: { label_bn: 'টাকা', label_en: 'Coins', Icon: CoinsIcon },
  'hands-heart': { label_bn: 'সাহায্যের হাত', label_en: 'Helping hands', Icon: HandsHeartIcon },
  users: { label_bn: 'মানুষ', label_en: 'People', Icon: UsersIcon },
} as const

export type ProjectIconKey = keyof typeof PROJECT_ICONS

/** অচেনা key এর আইকন */
export const FALLBACK_ICON = FallbackIcon
