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
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: `
    app-json-viewer pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-words;
      font-family: var(--font-ibm);
      font-size: 12px;
      line-height: 1.7;
      color: var(--muted-foreground);
    }

    app-json-viewer .json-key     { color: var(--accent-green); }
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
      [attr.aria-label]="ariaLabel()"
      [innerHTML]="safeHtml()"
    ></pre>
  `,
})
export class JsonViewerComponent {
  private readonly sanitizer = inject(DomSanitizer)
  private readonly pipe = new JsonHighlightPipe()

  readonly value = input<string | null | undefined>('')
  readonly ariaLabel = input<string>('JSON data')

  readonly safeHtml = computed(() => {
    const highlighted = this.pipe.transform(this.value())
    return this.sanitizer.bypassSecurityTrustHtml(highlighted)
  })
}
