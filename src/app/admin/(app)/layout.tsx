import AppNav from '@/components/shared/AppNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <main>{children}</main>
    </>
  )
}
