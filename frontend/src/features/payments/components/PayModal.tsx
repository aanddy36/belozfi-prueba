import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { Input } from '@/common/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/common/components/ui/radio-group'
import { dollarsToCents, formatCents } from '@/common/utils/money'
import { createPayment } from '@/features/payments/services/paymentsService'

type PayOption = 'minimum' | 'full' | 'other'

interface PayModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  minimumPaymentCents: number
  currentDebtCents: number
}

export function PayModal({ open, onOpenChange, minimumPaymentCents, currentDebtCents }: PayModalProps) {
  const [option, setOption] = useState<PayOption>('minimum')
  const [otherAmount, setOtherAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (open) {
      setOption('minimum')
      setOtherAmount('')
      setError(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: (amountCents: number) => createPayment(amountCents),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      onOpenChange(false)
      toast.success('Payment confirmed')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong')
    },
  })

  const floorCents = Math.min(2500, currentDebtCents)

  function handleConfirm() {
    setError(null)

    if (option === 'minimum') {
      mutation.mutate(minimumPaymentCents)
      return
    }
    if (option === 'full') {
      mutation.mutate(currentDebtCents)
      return
    }

    const dollars = Number(otherAmount)
    if (!otherAmount || Number.isNaN(dollars) || dollars <= 0) {
      setError('Enter an amount')
      return
    }
    const amountCents = dollarsToCents(dollars)
    if (amountCents < floorCents) {
      setError(`Minimum payment is ${formatCents(floorCents)}`)
      return
    }
    if (amountCents > currentDebtCents) {
      setError('Amount exceeds your current debt')
      return
    }
    mutation.mutate(amountCents)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How much do you want to pay?</DialogTitle>
          <DialogDescription>Select the amount to pay</DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={option}
          onValueChange={(value) => setOption(value as PayOption)}
          disabled={mutation.isPending}
        >
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="flex items-center gap-2">
              <RadioGroupItem value="minimum" />
              Minimum payment
            </span>
            <span className="text-sm font-medium">{formatCents(minimumPaymentCents)}</span>
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="flex items-center gap-2">
              <RadioGroupItem value="full" />
              Full payment
            </span>
            <span className="text-sm font-medium">{formatCents(currentDebtCents)}</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3">
            <RadioGroupItem value="other" />
            Other amount
          </label>
        </RadioGroup>

        {option === 'other' && (
          <Input
            type="number"
            step="0.01"
            placeholder="Amount"
            value={otherAmount}
            onChange={(e) => setOtherAmount(e.target.value)}
            disabled={mutation.isPending}
          />
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button onClick={handleConfirm} disabled={mutation.isPending} className="w-full">
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {mutation.isPending ? 'Processing...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
