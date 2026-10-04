import { API_VERSION, getInstance } from '@vidfriends/contracts';
import { handler } from '../../http/register.js';
import { adminExists } from '../auth/service.js';
import { getSettings } from '../settings/service.js';
import { SERVER_VERSION } from '../../version.js';

export const instanceHandlers = [
  handler(getInstance, async ({ deps }) => {
    const settings = await getSettings(deps.db);
    return {
      name: settings.instance_name,
      version: SERVER_VERSION,
      api_version: API_VERSION,
      signup_mode: settings.signup_mode,
      setup_complete: await adminExists(deps.db),
      retention_days: settings.retention_days,
    };
  }),
];
