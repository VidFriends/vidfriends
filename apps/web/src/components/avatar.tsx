import { cn } from '@/lib/utils';

/** User avatar with an initial as fallback. Decorative: the name is always shown next to it. */
export function Avatar({
  user,
  size = 40,
  className,
}: {
  user: { display_name: string; username: string; avatar_url: string | null };
  size?: number;
  className?: string;
}) {
  const name = user.display_name || user.username;
  const style = { width: size, height: size };
  return user.avatar_url ? (
    <img
      src={user.avatar_url}
      alt=""
      style={style}
      className={cn('shrink-0 rounded-full object-cover', className)}
    />
  ) : (
    <span
      aria-hidden
      style={style}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary',
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
