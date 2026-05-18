import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gestionale Edile',
  description: 'Sistema di controllo finanziario impresa edile',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}
