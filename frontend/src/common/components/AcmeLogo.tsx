import { cn } from '@/common/utils/utils'

interface AcmeLogoProps {
  className?: string
  variant?: 'default' | 'inverted'
}

/**
 * Logo de Acme Credit: una "A" sobre un badge redondeado.
 * variant="default" para fondos claros (primary sobre primary/10).
 * variant="inverted" para usar sobre la tarjeta (fondo ya morado).
 */
export function AcmeLogo({ className, variant = 'default' }: AcmeLogoProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl font-bold',
        variant === 'inverted' ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary',
        className
      )}
    >
      A
    </div>
  )
}
