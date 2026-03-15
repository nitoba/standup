export type EmailThemeKey = 'light' | 'dark'

export interface EmailTheme {
  bg: string
  cardBg: string
  headerBg: string
  insightBg: string
  footerBg: string
  headerText: string
  text: string
  textSecondary: string
  textMuted: string
  accent: string
  insightBorder: string
  divider: string
  cardHeaderBg: string
  cardHeaderText: string
  tagBg: string
  tagText: string
}

const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`

const HUE_BRAND = 160
const HUE_INSIGHT = 145
const HUE_CARD = 145

export const LIGHT_THEME: EmailTheme = {
  bg: hsl(220, 15, 96),
  cardBg: '#ffffff',
  headerBg: hsl(HUE_BRAND, 65, 28),
  insightBg: hsl(HUE_INSIGHT, 55, 95),
  footerBg: hsl(220, 10, 94),
  headerText: '#ffffff',
  text: hsl(220, 15, 15),
  textSecondary: hsl(220, 10, 40),
  textMuted: hsl(220, 8, 55),
  accent: hsl(HUE_BRAND, 65, 40),
  insightBorder: hsl(HUE_INSIGHT, 70, 45),
  divider: hsl(220, 15, 88),
  cardHeaderBg: hsl(HUE_CARD, 30, 93),
  cardHeaderText: hsl(HUE_CARD, 25, 25),
  tagBg: hsl(HUE_BRAND, 50, 92),
  tagText: hsl(HUE_BRAND, 60, 30),
}

export const DARK_THEME: EmailTheme = {
  bg: hsl(220, 13, 11),
  cardBg: hsl(220, 13, 16),
  headerBg: hsl(HUE_BRAND, 55, 18),
  insightBg: hsl(HUE_INSIGHT, 30, 14),
  footerBg: hsl(220, 13, 13),
  headerText: '#ffffff',
  text: hsl(220, 12, 84),
  textSecondary: hsl(220, 10, 62),
  textMuted: hsl(220, 8, 48),
  accent: hsl(HUE_BRAND, 70, 68),
  insightBorder: hsl(HUE_INSIGHT, 70, 60),
  divider: hsl(220, 13, 24),
  cardHeaderBg: hsl(HUE_CARD, 20, 20),
  cardHeaderText: hsl(HUE_CARD, 15, 80),
  tagBg: hsl(HUE_BRAND, 30, 20),
  tagText: hsl(HUE_BRAND, 60, 70),
}

export const THEMES: Record<EmailThemeKey, EmailTheme> = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
}

export function getTheme(preference: EmailThemeKey = 'light'): EmailTheme {
  return THEMES[preference]
}
