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
          <span>theme_mode</span>
        </div>
      }

      <z-combobox
        [zWidth]="fullWidth() ? 'full' : 'default'"
        [options]="themeOptions()"
        [value]="currentTheme()"
        [searchable]="false"
        placeholder="select theme"
        [ariaLabel]="'Theme mode selector'"
        [buttonVariant]="'outline'"
        searchPlaceholder="search theme..."
        emptyText="No theme available."
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
      label: 'light',
      icon: 'sun',
    },
    {
      value: EDarkModes.DARK,
      label: 'dark',
      icon: 'moon',
    },
    {
      value: EDarkModes.SYSTEM,
      label: 'system',
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
