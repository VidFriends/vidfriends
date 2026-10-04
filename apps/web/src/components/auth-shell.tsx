import type { ReactNode } from 'react';
import { SiteFooter } from './info-page';
import { Card } from './ui/card';

/** Centered layout for setup, login and join screens. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="main" className="flex min-h-full flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="mb-6 grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {children}
      </Card>
      <SiteFooter />
    </main>
  );
}
