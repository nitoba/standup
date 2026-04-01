import { readFileSync } from 'node:fs'

const templateCache = new Map<string, string>()

export function loadPromptTemplate(fileName: string): string {
  const cached = templateCache.get(fileName)
  if (cached !== undefined) {
    return cached
  }

  const template = readFileSync(
    new URL(`./prompts/${fileName}`, import.meta.url),
    'utf8',
  )
  templateCache.set(fileName, template)
  return template
}
