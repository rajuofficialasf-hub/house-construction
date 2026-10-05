/**
 * পরিসংখ্যান কার্ডের আইকন-রেজিস্ট্রি (পর্ব ২, M-ধাপ ৮): `stat_cards[].icon` এখানের একটি key; অচেনা হলে users।
 * প্যানেলের কার্ড-বিল্ডার এই তালিকা থেকে বাছাই দেখায়। আকার ./statIconShapes.tsx এ।
 */
import {
  CalendarStatIcon,
  ChartStatIcon,
  CoinsStatIcon,
  GridStatIcon,
  HeartStatIcon,
  HouseStatIcon,
  MapStatIcon,
  PinStatIcon,
  TagsStatIcon,
  UsersStatIcon,
} from './statIconShapes'

export const STAT_ICONS = {
  users: { label_bn: 'মানুষ', label_en: 'People', Icon: UsersStatIcon },
  house: { label_bn: 'ঘর', label_en: 'House', Icon: HouseStatIcon },
  map: { label_bn: 'মানচিত্র', label_en: 'Map', Icon: MapStatIcon },
  pin: { label_bn: 'জায়গা', label_en: 'Location', Icon: PinStatIcon },
  grid: { label_bn: 'ঘরছক', label_en: 'Grid', Icon: GridStatIcon },
  coins: { label_bn: 'টাকা', label_en: 'Money', Icon: CoinsStatIcon },
  tags: { label_bn: 'ক্যাটাগরি', label_en: 'Categories', Icon: TagsStatIcon },
  calendar: { label_bn: 'সাল', label_en: 'Year', Icon: CalendarStatIcon },
  chart: { label_bn: 'চার্ট', label_en: 'Chart', Icon: ChartStatIcon },
  heart: { label_bn: 'সাহায্য', label_en: 'Help', Icon: HeartStatIcon },
} as const

export type StatIconKey = keyof typeof STAT_ICONS

export const FALLBACK_STAT_ICON = UsersStatIcon
