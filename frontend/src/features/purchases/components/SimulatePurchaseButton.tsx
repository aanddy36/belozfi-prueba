import { Plus } from 'lucide-react'

interface SimulatePurchaseButtonProps {
  onClick: () => void
}

export function SimulatePurchaseButton({ onClick }: SimulatePurchaseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Simulate purchase"
      className="fixed top-1/2 right-6 flex size-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
    >
      <Plus className="size-6" />
    </button>
  )
}
