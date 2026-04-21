import { createClient } from '@/lib/supabase/server'
import TemplatesList from '@/components/TemplatesList'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('templates').select('id, content').order('id')

  const byId = Object.fromEntries((data ?? []).map((t) => [t.id, t.content]))

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-sm text-slate-500 mt-1">Edit the text directly. Changes save automatically.</p>
      </div>
      <TemplatesList initialData={byId} />
    </div>
  )
}
