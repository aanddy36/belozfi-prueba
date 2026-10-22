import { toast } from 'sonner'
import { apiFetch } from '@/api/client'
import { Button } from '@/common/components/ui/button'

export function TestConnectionPage() {
  async function handleTest() {
    try {
      const res = await apiFetch<{ status: string; db: string }>('/health')
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
    <div className="flex h-screen items-center justify-center">
      <Button onClick={handleTest}>Test connection</Button>
    </div>
  )
}
