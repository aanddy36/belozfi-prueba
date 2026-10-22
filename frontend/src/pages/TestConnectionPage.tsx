import { toast } from 'sonner'
import { PageShell } from '@/common/components/PageShell'
import { Button } from '@/common/components/ui/button'

const API_URL = import.meta.env.VITE_API_URL

export function TestConnectionPage() {
  async function handleTest() {
    try {
      // /health es el único endpoint que no sigue el envelope estándar {statusCode, message, data}
      // (ver Spec 2 design.md), así que no usa apiFetch acá.
      const response = await fetch(`${API_URL}/health`)
      const res = (await response.json()) as { status: string; db: string }
      if (res.status === 'ok' && res.db === 'ok') {
        toast.success('Connection OK: backend + DB reachable')
      } else {
        toast.error(`DB issue: ${JSON.stringify(res)}`)
      }
    } catch (e) {
      toast.error(`Connection failed: ${(e as Error).message}`)
    }
  }

  return (
    <PageShell showHeader={false}>
      <div className="flex flex-1 items-center justify-center">
        <Button onClick={handleTest}>Test connection</Button>
      </div>
    </PageShell>
  )
}
