import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

type Section = { title: string; body: string[] };

/** A readable long-form page (privacy disclosure, help) built from i18n sections. */
export function InfoPage({
  ns,
  values = {},
}: {
  ns: 'privacy' | 'help';
  values?: Record<string, string | number>;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = useNavigate();
  const sections = t(`${ns}.sections`, { returnObjects: true, ...values }) as Section[];
  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          window.history.length > 1 ? router.history.back() : void navigate({ to: '/' })
        }
      >
        <ArrowLeft aria-hidden />
        <span>{t('common.back')}</span>
      </Button>
      <article className="mt-4 grid gap-6">
        <header className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t(`${ns}.title`, values)}</h1>
          <p className="text-lg text-muted-foreground">{t(`${ns}.intro`, values)}</p>
        </header>
        {sections.map((s) => (
          <section key={s.title} className="grid gap-2">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            {s.body.map((p) => (
              <p key={p} className="leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
      <SiteFooter />
    </main>
  );
}

/** Links every screen offers to the privacy disclosure and help (M5-T8). */
export function SiteFooter() {
  const { t } = useTranslation();
  const link =
    'underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm';
  return (
    <nav
      aria-label={t('footer.label')}
      className="mt-8 flex justify-center gap-4 text-sm text-muted-foreground"
    >
      <Link to="/privacy" className={link}>
        {t('footer.privacy')}
      </Link>
      <Link to="/help" className={link}>
        {t('footer.help')}
      </Link>
    </nav>
  );
}
