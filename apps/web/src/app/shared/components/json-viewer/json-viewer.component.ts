import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import { JsonHighlightPipe } from '../../pipes/json-highlight.pipe'

@Component({
  selector: 'app-json-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [JsonHighlightPipe],
  styles: `
    app-json-viewer pre {
      font-family: var(--font-jetbrains);
    }

    app-json-viewer .json-key     { color: var(--primary); }
    app-json-viewer .json-string  { color: var(--foreground); opacity: 0.85; }
    app-json-viewer .json-number  { color: #f59e0b; }
    app-json-viewer .json-boolean { color: #3b82f6; }
    app-json-viewer .json-null    { color: var(--muted-foreground); font-style: italic; }
    app-json-viewer .json-bracket { color: var(--muted-foreground); opacity: 0.6; }
    app-json-viewer .json-comma   { color: var(--muted-foreground); opacity: 0.5; }
  `,
  template: `
    <pre
      role="region"
      class="font-semibold leading-relaxed tracking-wide m-0 wrap-break-word text-xs text-muted-foreground whitespace-pre-wrap"
      [attr.aria-label]="ariaLabel()"
      [innerHTML]="safeHtml()"
    ></pre>
  `,
})
export class JsonViewerComponent {
  private readonly sanitizer = inject(DomSanitizer)
  private readonly pipe = inject(JsonHighlightPipe)

  readonly value = input<string | null | undefined>('')
  readonly ariaLabel = input<string>('JSON data')

  readonly safeHtml = computed(() => {
    const highlighted = this.pipe.transform(this.value())
    return this.sanitizer.bypassSecurityTrustHtml(highlighted)
  })
}
