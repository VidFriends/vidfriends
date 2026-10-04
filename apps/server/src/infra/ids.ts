import { v7 } from 'uuid';

/** UUIDv7 ids generated in the app (LLD §1). */
export const newId = (): string => v7();
