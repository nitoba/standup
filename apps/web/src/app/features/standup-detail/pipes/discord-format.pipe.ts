import { inject, Pipe, type PipeTransform } from '@angular/core'
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser'

/**
 * Renders Discord-style markdown formatting as safe HTML:
 * - **text** → <strong> (bold)
 * - `text`   → <code> monospace with --primary color highlight
 */
@Pipe({
  name: 'discordFormat',
})
export class DiscordFormatPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer)

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return ''

    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    const formatted = escaped
      // **text** → bold (no newlines allowed inside)
      .replace(/\*\*([^\n*]+?)\*\*/g, '<strong>$1</strong>')
      // `text` → monospace with primary color highlight
      .replace(
        /`([^`\n]+)`/g,
        '<code style="font-family:var(--font-jetbrains,monospace);background-color:color-mix(in srgb,var(--primary) 12%,transparent);color:var(--primary);padding:1px 5px;border-radius:3px;font-size:0.9em;">$1</code>',
      )

    return this.sanitizer.bypassSecurityTrustHtml(formatted)
  }
}
