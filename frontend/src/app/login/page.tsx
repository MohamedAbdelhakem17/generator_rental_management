'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Languages, Zap } from 'lucide-react';
import { z } from 'zod';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LoginFormValues = { email: string; password: string };

interface LoginResponse {
  user: { id: string; name: string; role: string };
}

export default function LoginPage() {
  const { t, direction, locale, setLocale } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  // Section 15: a countdown, not a raw error code, while the login rate limit (TASK-034) is
  // in effect — ticks down to 0 and clears itself so the form re-enables automatically.
  useEffect(() => {
    if (retryAfterSeconds === null || retryAfterSeconds <= 0) return;
    const timer = setTimeout(() => setRetryAfterSeconds(retryAfterSeconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryAfterSeconds]);

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().min(1, t('login.emailRequired')).email(t('login.emailInvalid')),
        password: z.string().min(1, t('login.passwordRequired')),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      await apiClient.post<LoginResponse>('/api/auth/login', values);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      router.replace('/');
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setRetryAfterSeconds(error.retryAfterSeconds ?? 60);
        return;
      }
      // FR-002: the backend already returns one generic message for both a wrong password
      // and an unknown email — shown as-is, never mapped to a field-level "not found".
      setFormError(error instanceof ApiError ? error.message : t('login.genericError'));
    }
  }

  const isRateLimited = retryAfterSeconds !== null && retryAfterSeconds > 0;

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-12" dir={direction}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute end-4 top-4 gap-1.5 px-2"
        onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
        aria-label={t('shell.toggleLanguage')}
      >
        <Languages className="size-4" aria-hidden />
        <span className="text-xs font-medium">{locale === 'ar' ? 'EN' : 'ع'}</span>
      </Button>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Zap className="size-5" aria-hidden />
          </span>
          <h1 className="text-base font-semibold text-foreground">{t('login.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {isRateLimited ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {t('login.rateLimited', { seconds: String(retryAfterSeconds) })}
            </p>
          ) : formError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t('login.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              aria-invalid={errors.email ? true : undefined}
              {...register('email')}
            />
            {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t('login.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              {...register('password')}
            />
            {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
          </div>

          <Button type="submit" disabled={isSubmitting || isRateLimited} className="mt-1 w-full">
            {isSubmitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </div>
    </main>
  );
}
