import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import QueryProvider from '@/shared/components/QueryProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: "Lim's Programming Tuition",
  description: 'Private 1-to-1 programming tuition for students and working adults.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${inter.className} bg-slate-50 min-h-screen`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
