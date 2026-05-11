import Link from 'next/link'
import LogoutButton from '@/components/shared/LogoutButton'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="bg-navy border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-100 hover:text-accentGold transition-colors mr-2 shrink-0">
            <span className="text-accentGold font-bold">&lt;/&gt;</span>
            Lim's Programming Tuition
          </Link>
          <div className="flex-1" />
          <LogoutButton redirectTo="/student/login" className="text-white/70 hover:text-white hover:bg-white/10" />
        </div>
      </nav>
      <main>{children}</main>
    </>
  )
}
