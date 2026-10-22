import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AcmeLogo } from '@/common/components/AcmeLogo'

interface PageShellProps {
  children: ReactNode
  /** Header con logo (-> /home) y logout. Las páginas fuera de sesión (Login) lo ocultan. */
  showHeader?: boolean
}

/**
 * Layout compartido por todas las páginas: fondo morado de borde a borde,
 * con una columna central más clara (max-width, de arriba a abajo).
 */
export function PageShell({ children, showHeader = true }: PageShellProps) {
  return (
    <div className="min-h-screen w-full bg-violet-50">
      <div className="animate-in fade-in slide-in-from-bottom-2 mx-auto flex min-h-screen w-full max-w-md flex-col bg-white duration-300">
        {showHeader && (
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <Link to="/home" aria-label="Go to home" className="flex items-center gap-2">
              <AcmeLogo className="h-8 w-8 text-sm" />
              <span className="text-sm font-semibold text-foreground">Acme Credit</span>
            </Link>
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Log out
            </Link>
          </header>
        )}
        <div className="flex flex-1 flex-col px-6 py-10">{children}</div>
      </div>
    </div>
  )
}
