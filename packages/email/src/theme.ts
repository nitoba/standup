// ---------------------------------------------------------------------------
// Email Theme System (Akita-inspired HSL approach)
//
// Hues are fixed per semantic section. Saturation and lightness are
// determined per layer (background, text, border) following WCAG guidelines:
//   - Light theme: bg ~94% L, text ~18% L  → contrast > 7:1 (WCAG AAA)
//   - Dark  theme: bg ~10% L, text ~83% L  → contrast > 6:1 (WCAG AA+)
//   - Borders: ~48% L — visible in both themes
// ---------------------------------------------------------------------------

export type EmailThemeKey = 'light' | 'dark'

export interface EmailTheme {
  // Background layers
  bg: string // outer wrapper
  cardBg: string // standup cards
  headerBg: string // email header strip
  insightBg: string // AI insights section
  footerBg: string // email footer

  // Text
  headerText: string // text on header bg
  text: string // primary body text
  textSecondary: string // metadata, dates, subtle text
  textMuted: string // footer text

  // Accents
  accent: string // links, highlights (hue 225 – royal green)
  insightBorder: string // left border on insights box (hue 210 – green)
  divider: string // horizontal rules

  // Standup card header
  cardHeaderBg: string // date header strip
  cardHeaderText: string // date text on card header

  // Tag/badge colors
  tagBg: string
  tagText: string
}

// HSL helpers — returns inline CSS value
const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`

// Base hues
const HUE_BRAND = 160 // Royal green — brand accent
const HUE_INSIGHT = 145 // green — AI insights section
const HUE_CARD = 145 // green-gray — card headers

export const LIGHT_THEME: EmailTheme = {
  bg: hsl(220, 15, 96), // near-white green-gray
  cardBg: '#ffffff',
  headerBg: hsl(HUE_BRAND, 65, 28), // deep royal green
  insightBg: hsl(HUE_INSIGHT, 55, 95), // very light green
  footerBg: hsl(220, 10, 94),

  headerText: '#ffffff',
  text: hsl(220, 15, 15), // near-black — contrast >8:1 on white
  textSecondary: hsl(220, 10, 40), // medium gray
  textMuted: hsl(220, 8, 55), // muted gray for footer

  accent: hsl(HUE_BRAND, 65, 40), // royal green link color
  insightBorder: hsl(HUE_INSIGHT, 70, 45), // vivid green left-border
  divider: hsl(220, 15, 88),

  cardHeaderBg: hsl(HUE_CARD, 30, 93), // very light green-gray
  cardHeaderText: hsl(HUE_CARD, 25, 25), // dark green-gray

  tagBg: hsl(HUE_BRAND, 50, 92),
  tagText: hsl(HUE_BRAND, 60, 30),
}

export const DARK_THEME: EmailTheme = {
  bg: hsl(220, 13, 11), // near-black
  cardBg: hsl(220, 13, 16), // dark card
  headerBg: hsl(HUE_BRAND, 55, 18), // deeper royal green
  insightBg: hsl(HUE_INSIGHT, 30, 14), // dark green tint
  footerBg: hsl(220, 13, 13),

  headerText: '#ffffff',
  text: hsl(220, 12, 84), // light gray — contrast >6:1 on dark card
  textSecondary: hsl(220, 10, 62), // medium light gray
  textMuted: hsl(220, 8, 48),

  accent: hsl(HUE_BRAND, 70, 68), // lighter royal green for dark bg
  insightBorder: hsl(HUE_INSIGHT, 70, 60), // vivid green, brighter on dark
  divider: hsl(220, 13, 24),

  cardHeaderBg: hsl(HUE_CARD, 20, 20), // dark card header
  cardHeaderText: hsl(HUE_CARD, 15, 80), // light text

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
