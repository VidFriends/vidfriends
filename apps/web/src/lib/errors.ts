import { ApiError } from '@vidfriends/api-client';
import type { TFunction } from 'i18next';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/** Translates a field reason code (contract message or server reason) into a message. */
export function fieldMessage(t: TFunction, reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  return t(`fieldErrors.${reason}`, { defaultValue: t('fieldErrors.invalid') });
}

/** Translates any error into a user-facing message. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    return t(`errors.${error.code}`, { defaultValue: t('common.genericError') });
  }
  return t('common.genericError');
}

/**
 * Applies server field errors to a form. Returns the general message to show, or null when every
 * problem was attached to a field.
 */
export function applyApiError<T extends FieldValues>(
  t: TFunction,
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (error instanceof ApiError && error.code === 'validation_failed') {
    const entries = Object.entries(error.fields);
    let unmatched = false;
    for (const [field, reason] of entries) {
      if ((fields as readonly string[]).includes(field)) {
        setError(field as Path<T>, { type: 'server', message: reason });
      } else unmatched = true;
    }
    if (entries.length && !unmatched) return null;
  }
  if (
    error instanceof ApiError &&
    error.code === 'username_taken' &&
    (fields as readonly string[]).includes('username')
  ) {
    setError('username' as Path<T>, { type: 'server', message: 'username_taken' });
    return null;
  }
  return errorMessage(t, error);
}
