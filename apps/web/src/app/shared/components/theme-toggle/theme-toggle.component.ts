import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core'
import { EDarkModes, ZardDarkMode } from '../../services/dark-mode'
import { ZardComboboxComponent, type ZardComboboxOption } from '../combobox'

@Component({
  selector: 'app-theme-toggle',
  imports: [ZardComboboxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2" [class.w-full]="fullWidth()">
      @if (showLabel()) {
        <div class="flex items-center gap-2 text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
          <span>$</span>
          <span>tema</span>
        </div>
      }

      <z-combobox
        [zWidth]="fullWidth() ? 'full' : 'default'"
        [options]="themeOptions()"
        [value]="currentTheme()"
        [searchable]="false"
        placeholder="selecionar tema"
        [ariaLabel]="'Seletor de tema'"
        [buttonVariant]="'outline'"
        searchPlaceholder="buscar tema..."
        emptyText="Nenhum tema disponível."
        (zValueChange)="onThemeChange($event)"
      />
    </div>
  `,
})
export class ThemeToggleComponent {
  private readonly darkMode = inject(ZardDarkMode)

  readonly showLabel = input(false, { transform: booleanAttribute })
  readonly fullWidth = input(false, { transform: booleanAttribute })

  readonly currentTheme = this.darkMode.currentTheme
  readonly themeOptions = computed<ZardComboboxOption[]>(() => [
    {
      value: EDarkModes.LIGHT,
      label: 'claro',
      icon: 'sun',
    },
    {
      value: EDarkModes.DARK,
      label: 'escuro',
      icon: 'moon',
    },
    {
      value: EDarkModes.SYSTEM,
      label: 'sistema',
      icon: 'monitor',
    },
  ])

  onThemeChange(mode: string | null) {
    if (
      mode !== EDarkModes.LIGHT &&
      mode !== EDarkModes.DARK &&
      mode !== EDarkModes.SYSTEM
    ) {
      return
    }

    this.darkMode.toggleTheme(mode)
  }
}
