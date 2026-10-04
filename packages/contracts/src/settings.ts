import { z } from 'zod';
import { SignupMode } from './routes/accounts.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const DEFAULT_PLATFORM_ALLOWLIST = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'instagram.com',
  'facebook.com',
  'fb.watch',
  'x.com',
  'twitter.com',
  'reddit.com',
  'redd.it',
  'vimeo.com',
];

/** Instance settings (FRD WF-ADM-3). Read at request time (BR-GEN-5). */
export const InstanceSettings = z.object({
  instance_name: z.string().trim().min(1).max(60).default('VidFriends'),
  signup_mode: SignupMode.default('invite_only'),
  members_can_invite: z.boolean().default(true),
  link_download_enabled: z.boolean().default(true),
  platform_allowlist: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
    )
    .max(100)
    .default(DEFAULT_PLATFORM_ALLOWLIST),
  max_media_bytes: z
    .number()
    .int()
    .min(MB)
    .max(10 * GB)
    .default(200 * MB),
  max_duration_seconds: z
    .number()
    .int()
    .min(10)
    .max(4 * 3600)
    .default(600),
  per_user_quota_bytes: z
    .number()
    .int()
    .min(0)
    .nullable()
    .default(5 * GB),
  instance_storage_cap_bytes: z.number().int().min(0).nullable().default(null),
  retention_days: z.number().int().min(0).max(3650).default(90),
  session_idle_days: z.number().int().min(1).max(365).default(30),
  session_absolute_days: z.number().int().min(1).max(3650).default(180),
});
export type InstanceSettings = z.infer<typeof InstanceSettings>;
export const InstanceSettingsPatch = InstanceSettings.partial();
