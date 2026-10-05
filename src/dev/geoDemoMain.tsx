/** শুধু dev: geo-demo.html এর এন্ট্রি (GeoDemo.tsx দেখুন) */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { LanguageProvider } from '@/i18n'
import { GeoDemo } from './GeoDemo'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <GeoDemo />
    </LanguageProvider>
  </StrictMode>,
)
