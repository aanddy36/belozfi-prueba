import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { AcmeLogo } from '@/common/components/AcmeLogo'
import { PageShell } from '@/common/components/PageShell'
import { Button } from '@/common/components/ui/button'
import { Input } from '@/common/components/ui/input'
import { Label } from '@/common/components/ui/label'

const loginSchema = z.object({
  username: z.string().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: 'john.doe',
      password: 'TempPass123!',
    },
  })

  function onSubmit() {
    // No hay autenticación real (ver infra.md sección 4.4) — cualquier valor ingresado inicia sesión.
    navigate('/home')
  }

  return (
    <PageShell showHeader={false}>
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full space-y-6">
          <div className="flex flex-col items-center gap-3">
            <AcmeLogo className="h-14 w-14 text-2xl" />
            <h1 className="text-center text-xl font-bold text-foreground">Acme Credit</h1>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" {...register('username')} />
              {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full">
              Log in
            </Button>
          </form>
        </div>
      </div>
    </PageShell>
  )
}
