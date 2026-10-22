import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
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
import { Label } from '@/common/components/ui/label'
import { dollarsToCents } from '@/common/utils/money'
import { createCollateralDeposit } from '@/features/collateral/services/collateralService'

const schema = z.object({
  depositDollars: z
    .string()
    .min(1, 'Required')
    .refine((v) => Number(v) >= 1000, 'Minimum deposit is $1,000'),
})

type FormValues = z.infer<typeof schema>

interface AddCollateralModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddCollateralModal({ open, onOpenChange }: AddCollateralModalProps) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: (depositDollars: number) => createCollateralDeposit(dollarsToCents(depositDollars)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collateral-deposits'] })
      reset()
      onOpenChange(false)
      toast.success('Deposit received — confirming shortly')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong')
    },
  })

  function onSubmit(values: FormValues) {
    mutation.mutate(Number(values.depositDollars))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add collateral</DialogTitle>
          <DialogDescription>Deposit more to increase your credit limit.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="collateral-deposit">Deposit amount</Label>
            <Input
              id="collateral-deposit"
              type="number"
              step="0.01"
              disabled={mutation.isPending}
              {...register('depositDollars')}
            />
            {errors.depositDollars && (
              <p className="text-xs text-destructive">{errors.depositDollars.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {mutation.isPending ? 'Creating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
