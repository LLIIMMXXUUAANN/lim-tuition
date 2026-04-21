import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800 mr-2 shrink-0">
            <span className="text-slate-900">&lt;/&gt;</span>
            Lim's Programming Tuition
          </Link>
          <div className="flex-1" />
          <LogoutButton redirectTo="/portal/login" />
        </div>
      </nav>
      <main>{children}</main>
    </>
  )
}
