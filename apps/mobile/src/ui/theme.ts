// Colours for light and dark mode; contrast pairs meet WCAG AA (NFR-A11Y-02).
import { useColorScheme } from 'react-native';

const light = {
  bg: '#ffffff',
  card: '#f4f4f5',
  text: '#18181b',
  muted: '#52525b',
  border: '#d4d4d8',
  primary: '#6d28d9',
  primaryText: '#ffffff',
  danger: '#b91c1c',
  dangerText: '#ffffff',
};
const dark: typeof light = {
  bg: '#09090b',
  card: '#18181b',
  text: '#fafafa',
  muted: '#a1a1aa',
  border: '#3f3f46',
  primary: '#a78bfa',
  primaryText: '#1e1b4b',
  danger: '#f87171',
  dangerText: '#450a0a',
};
export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
