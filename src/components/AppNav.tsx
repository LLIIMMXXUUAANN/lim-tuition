'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'

const NAV_LINKS = [
  { label: 'Students', href: '/students' },
  { label: 'Templates', href: '/templates' },
]

export default function AppNav() {
  const pathname = usePathname()

  return (
    <nav className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800 mr-2 shrink-0">
          <span className="text-slate-900">&lt;/&gt;</span>
          Lim&apos;s Programming Tuition
        </Link>
        <div className="flex gap-1 flex-1">
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>
        <LogoutButton />
      </div>
    </nav>
  )
}
