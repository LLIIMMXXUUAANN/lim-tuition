'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from './LogoutButton'

const NAV_LINKS = [
  { label: 'Students', href: '/admin/students' },
  { label: 'Templates', href: '/admin/templates' },
  { label: 'Timetable', href: '/admin/timetable' },
  { label: 'AI Agent', href: '/admin/agent', gold: true },
]

export default function AppNav() {
  const pathname = usePathname()

  return (
    <nav className="bg-navy border-b border-slate-800 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-100 hover:text-accentGold transition-colors mr-2 shrink-0">
          <span className="text-accentGold font-bold">&lt;/&gt;</span>
          Lim&apos;s Programming Tuition
        </Link>
        <div className="flex gap-1 flex-1">
          {NAV_LINKS.map(({ label, href, gold }) => {
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  gold
                    ? isActive
                      ? 'bg-accentGold/20 text-accentGold'
                      : 'text-accentGold/90 hover:text-accentGold hover:bg-accentGold/10'
                    : isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>
        <LogoutButton className="text-white/70 hover:text-white hover:bg-white/10" />
      </div>
    </nav>
  )
}
