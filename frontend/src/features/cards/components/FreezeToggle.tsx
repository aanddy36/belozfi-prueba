import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { Switch } from '@/common/components/ui/switch'
import { freezeCard } from '@/features/cards/services/cardsService'

interface FreezeToggleProps {
  frozen: boolean
  disabled?: boolean
}

export function FreezeToggle({ frozen, disabled }: FreezeToggleProps) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (next: boolean) => freezeCard(next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] })
      toast.success('Card updated')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong')
    },
  })

  return (
    <label className="flex items-center justify-between rounded-lg border border-border p-3">
      <span className="text-sm font-medium">Freeze card</span>
      <Switch
        checked={frozen}
        disabled={disabled || mutation.isPending}
        onCheckedChange={(checked) => mutation.mutate(checked)}
      />
    </label>
  )
}
