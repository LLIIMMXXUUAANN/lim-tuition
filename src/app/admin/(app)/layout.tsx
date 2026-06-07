import AppNav from '@/shared/components/AppNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <main>{children}</main>
    </>
  )
}
