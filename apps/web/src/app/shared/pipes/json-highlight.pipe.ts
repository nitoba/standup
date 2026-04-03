import { Pipe, type PipeTransform } from '@angular/core'

// Use U+001E (Record Separator) — safe ASCII ctrl char, never appears in JSON
const SEP = String.fromCharCode(30)
const PLACEHOLDER_RE = new RegExp(`${SEP}(\\d+)${SEP}`, 'g')

/**
 * Transforms a JSON string into HTML with syntax highlighting.
 * Uses CSS custom properties so it adapts to light/dark themes.
 *
 * Token classes:
 *   .json-key     — object keys
 *   .json-string  — string values
 *   .json-number  — numeric values
 *   .json-boolean — true / false
 *   .json-null    — null
 *   .json-bracket — { } [ ]
 *   .json-comma   — , :
 */
@Pipe({ name: 'jsonHighlight' })
export class JsonHighlightPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return ''

    let text = value
    try {
      text = JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      // Use raw string as-is (e.g. truncated previews)
    }

    return this.highlight(text)
  }

  private highlight(json: string): string {
    const tokens: string[] = []

    // Replace JSON tokens with indexed placeholders BEFORE HTML-escaping,
    // so the regex works on raw quotes and special chars.
    const withPlaceholders = json.replace(
      /("(?:\\.|[^"\\])*"(\s*:)?|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\],:])/g,
      (match) => {
        const idx = tokens.length
        tokens.push(this.tokenToSpan(match))
        return `${SEP}${idx}${SEP}`
      },
    )

    // Escape HTML in the remaining (non-token) text
    const escaped = this.escapeHtml(withPlaceholders)

    // Restore pre-built span tags
    return escaped.replace(
      PLACEHOLDER_RE,
      (_, idx) => tokens[Number(idx)] ?? '',
    )
  }

  private tokenToSpan(match: string): string {
    if (match.startsWith('"')) {
      const isKey = match.endsWith(':')
      const raw = isKey ? match.slice(0, -1) : match
      const safe = this.escapeHtml(raw)
      return isKey
        ? `<span class="json-key">${safe}</span>:`
        : `<span class="json-string">${safe}</span>`
    }
    if (match === 'true' || match === 'false') {
      return `<span class="json-boolean">${match}</span>`
    }
    if (match === 'null') {
      return `<span class="json-null">${match}</span>`
    }
    if (match === '{' || match === '}' || match === '[' || match === ']') {
      return `<span class="json-bracket">${match}</span>`
    }
    if (match === ',' || match === ':') {
      return `<span class="json-comma">${match}</span>`
    }
    return `<span class="json-number">${match}</span>`
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}
