import { describe, expect, it } from 'vitest'
import { DARK_THEME, getTheme, LIGHT_THEME, THEMES } from './theme'

describe('getTheme', () => {
  it('returns LIGHT_THEME for "light"', () => {
    expect(getTheme('light')).toBe(LIGHT_THEME)
  })

  it('returns DARK_THEME for "dark"', () => {
    expect(getTheme('dark')).toBe(DARK_THEME)
  })

  it('defaults to LIGHT_THEME when no argument is given', () => {
    expect(getTheme()).toBe(LIGHT_THEME)
  })

  it('THEMES record contains both themes', () => {
    expect(THEMES.light).toBe(LIGHT_THEME)
    expect(THEMES.dark).toBe(DARK_THEME)
  })
})

describe('LIGHT_THEME', () => {
  it('has a white cardBg', () => {
    expect(LIGHT_THEME.cardBg).toBe('#ffffff')
  })

  it('has white headerText', () => {
    expect(LIGHT_THEME.headerText).toBe('#ffffff')
  })

  it('has all required keys', () => {
    const requiredKeys = [
      'bg',
      'cardBg',
      'headerBg',
      'insightBg',
      'footerBg',
      'headerText',
      'text',
      'textSecondary',
      'textMuted',
      'accent',
      'insightBorder',
      'divider',
      'cardHeaderBg',
      'cardHeaderText',
      'tagBg',
      'tagText',
    ] as const

    for (const key of requiredKeys) {
      expect(LIGHT_THEME[key]).toBeTruthy()
    }
  })
})

describe('DARK_THEME', () => {
  it('has white headerText', () => {
    expect(DARK_THEME.headerText).toBe('#ffffff')
  })

  it('has all required keys', () => {
    const requiredKeys = [
      'bg',
      'cardBg',
      'headerBg',
      'insightBg',
      'footerBg',
      'headerText',
      'text',
      'textSecondary',
      'textMuted',
      'accent',
      'insightBorder',
      'divider',
      'cardHeaderBg',
      'cardHeaderText',
      'tagBg',
      'tagText',
    ] as const

    for (const key of requiredKeys) {
      expect(DARK_THEME[key]).toBeTruthy()
    }
  })
})
