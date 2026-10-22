import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { Button } from '@/common/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/common/components/ui/dialog'
import { closeAccount } from '@/features/accounts/services/accountsService'

interface CancelCardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentDebtCents: number
}

export function CancelCardModal({ open, onOpenChange, currentDebtCents }: CancelCardModalProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasDebt = currentDebtCents > 0

  const mutation = useMutation({
    mutationFn: () => closeAccount(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] })
      onOpenChange(false)
      toast.success('Card cancelled — your collateral was released')
      navigate('/home')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel card</DialogTitle>
          <DialogDescription>
            {hasDebt
              ? "You can't cancel your card while you have an outstanding balance."
              : 'This will close your account and release your collateral. This cannot be undone.'}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={hasDebt || mutation.isPending}
            className="w-full"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {mutation.isPending ? 'Cancelling...' : 'Confirm cancellation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
