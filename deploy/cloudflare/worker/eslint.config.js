import { config } from '@vidfriends/config/eslint';

export default [...config({ tsconfigRootDir: import.meta.dirname })];
