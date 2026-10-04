// Fixed reaction set (BR-ENG-2) with optimistic update and rollback (SDD §5).
import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@vidfriends/api-client/react';
import { clearReaction, REACTIONS, setReaction, type Reaction } from '@vidfriends/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

export function ReactionBar({
  shareId,
  initial,
  className,
}: {
  shareId: string;
  initial: Reaction | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState<Reaction | null>(initial);
  const onSettled = () =>
    queryClient.invalidateQueries({
      predicate: (q) =>
        ['getShare', 'getSent', 'getInbox', 'getSaved', 'getHistory'].includes(
          q.queryKey[0] as string,
        ),
    });
  const set = useApiMutation(setReaction, { onSettled });
  const clear = useApiMutation(clearReaction, { onSettled });
  const choose = (emoji: Reaction) => {
    const previous = current;
    const next = previous === emoji ? null : emoji;
    setCurrent(next);
    const rollback = (err: unknown) => {
      setCurrent(previous);
      toast.error(errorMessage(t, err));
    };
    if (next) set.mutate({ params: { id: shareId }, body: { emoji: next } }, { onError: rollback });
    else clear.mutate({ params: { id: shareId } }, { onError: rollback });
  };
  return (
    <div
      role="group"
      aria-label={t('reactions.label')}
      className={cn('flex flex-wrap gap-1', className)}
    >
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-pressed={current === emoji}
          aria-label={
            current === emoji
              ? `${t(`reactions.${emoji}`)} (${t('reactions.clear')})`
              : t(`reactions.${emoji}`)
          }
          onClick={() => choose(emoji)}
          className={cn(
            'flex size-10 items-center justify-center rounded-full text-xl transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            current === emoji
              ? 'scale-110 bg-primary/25 ring-2 ring-primary'
              : 'bg-black/30 hover:bg-black/50',
          )}
        >
          <span aria-hidden>{emoji}</span>
        </button>
      ))}
    </div>
  );
}
