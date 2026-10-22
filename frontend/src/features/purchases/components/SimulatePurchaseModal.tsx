import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/common/components/ui/select'
import { dollarsToCents } from '@/common/utils/money'
import type { InstallmentPlan } from '@/features/purchases/services/purchasesService'
import { createPurchase } from '@/features/purchases/services/purchasesService'

const schema = z.object({
  merchantName: z.string().min(1, 'Required'),
  amountDollars: z
    .string()
    .min(1, 'Required')
    .refine((v) => Number(v) > 0, 'Enter an amount'),
  installmentPlan: z.enum(['1', '3', '6', '12']),
})

type FormValues = z.infer<typeof schema>

interface SimulatePurchaseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableCreditCents: number
}

export function SimulatePurchaseModal({ open, onOpenChange, availableCreditCents }: SimulatePurchaseModalProps) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { installmentPlan: '1' },
  })

  const mutation = useMutation({
    mutationFn: ({ merchantName, amountDollars, installmentPlan }: FormValues) =>
      createPurchase(merchantName, dollarsToCents(Number(amountDollars)), Number(installmentPlan) as InstallmentPlan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      reset()
      onOpenChange(false)
      toast.success('Purchase authorized')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong')
    },
  })

  function onSubmit(values: FormValues) {
    if (dollarsToCents(Number(values.amountDollars)) > availableCreditCents) {
      setError('amountDollars', { message: 'Amount exceeds your available limit' })
      return
    }
    mutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Simulate purchase</DialogTitle>
          <DialogDescription>This creates a real purchase authorized against your available limit.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="merchantName">Merchant name</Label>
            <Input
              id="merchantName"
              placeholder="DECATHLON"
              disabled={mutation.isPending}
              {...register('merchantName')}
            />
            {errors.merchantName && <p className="text-xs text-destructive">{errors.merchantName.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amountDollars">Amount</Label>
            <Input
              id="amountDollars"
              type="number"
              step="0.01"
              disabled={mutation.isPending}
              {...register('amountDollars')}
            />
            {errors.amountDollars && <p className="text-xs text-destructive">{errors.amountDollars.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Installments</Label>
            <Controller
              control={control}
              name="installmentPlan"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={mutation.isPending}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 installment</SelectItem>
                    <SelectItem value="3">3 installments</SelectItem>
                    <SelectItem value="6">6 installments</SelectItem>
                    <SelectItem value="12">12 installments</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {mutation.isPending ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
