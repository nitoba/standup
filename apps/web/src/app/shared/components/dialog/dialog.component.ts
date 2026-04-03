import { OverlayModule } from '@angular/cdk/overlay'
import {
  BasePortalOutlet,
  CdkPortalOutlet,
  type ComponentPortal,
  PortalModule,
  type TemplatePortal,
} from '@angular/cdk/portal'
import {
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  computed,
  ElementRef,
  type EmbeddedViewRef,
  type EventEmitter,
  inject,
  NgModule,
  output,
  type TemplateRef,
  type Type,
  type ViewContainerRef,
  ViewEncapsulation,
  viewChild,
} from '@angular/core'
import { ZardButtonComponent } from '@/shared/components/button/button.component'
import { ZardIconComponent } from '@/shared/components/icon/icon.component'
import type { ZardIcon } from '@/shared/components/icon/icons'
import { mergeClasses, noopFn } from '@/shared/utils/merge-classes'
import { ZardDialogService } from './dialog.service'
import { dialogVariants } from './dialog.variants'
import type { ZardDialogRef } from './dialog-ref'

// Used by the NgModule provider definition

export type OnClickCallback<T> = (instance: T) => false | void | object
export class ZardDialogOptions<T, U> {
  zCancelIcon?: ZardIcon
  zCancelText?: string | null
  zClosable?: boolean
  zContent?: string | TemplateRef<T> | Type<T>
  zCustomClasses?: string
  zData?: U
  zDescription?: string
  zHideFooter?: boolean
  zMaskClosable?: boolean
  zOkDestructive?: boolean
  zOkDisabled?: boolean
  zOkIcon?: ZardIcon
  zOkText?: string | null
  zOnCancel?: EventEmitter<T> | OnClickCallback<T> = noopFn
  zOnOk?: EventEmitter<T> | OnClickCallback<T> = noopFn
  zTitle?: string | TemplateRef<T>
  zViewContainerRef?: ViewContainerRef
  zWidth?: string
}

@Component({
  selector: 'z-dialog',
  imports: [
    OverlayModule,
    PortalModule,
    ZardButtonComponent,
    ZardIconComponent,
  ],
  template: `
    @if (config.zClosable || config.zClosable === undefined) {
      <button
        type="button"
        data-testid="z-close-header-button"
        z-button
        zType="ghost"
        zSize="sm"
        class="absolute top-2 right-2"
        (click)="onCloseClick()"
      >
        <z-icon zType="x" />
      </button>
    }

    @if (config.zTitle || config.zDescription) {
      <header class="flex flex-col gap-2 text-left pr-10">
        @if (config.zTitle) {
          <h4
            data-testid="z-title"
            class="font-[var(--font-jetbrains)] text-[16px] font-bold tracking-[0.01em] text-card-foreground"
          >
            {{ config.zTitle }}
          </h4>

          @if (config.zDescription) {
            <p
              data-testid="z-description"
              class="font-[var(--font-ibm)] text-[12px] leading-[1.6] text-muted-foreground"
            >
              {{ config.zDescription }}
            </p>
          }
        }
      </header>
    }

    <main class="flex flex-col gap-4 font-[var(--font-ibm)] text-[13px] leading-[1.6] text-foreground">
      <ng-template cdkPortalOutlet />

      @if (isStringContent) {
        <div data-testid="z-content" [innerHTML]="config.zContent"></div>
      }
    </main>

    @if (!config.zHideFooter) {
      <footer class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-3">
        @if (config.zCancelText !== null) {
          <button
            type="button"
            data-testid="z-cancel-button"
            z-button
            zType="outline"
            zSize="default"
            (click)="onCloseClick()"
          >
            @if (config.zCancelIcon) {
              <z-icon [zType]="config.zCancelIcon" />
            }

            {{ config.zCancelText ?? 'Cancel' }}
          </button>
        }

        @if (config.zOkText !== null) {
          <button
            type="button"
            data-testid="z-ok-button"
            z-button
            [zType]="config.zOkDestructive ? 'destructive' : 'default'"
            zSize="default"
            [disabled]="config.zOkDisabled"
            (click)="onOkClick()"
          >
            @if (config.zOkIcon) {
              <z-icon [zType]="config.zOkIcon" />
            }

            {{ config.zOkText ?? 'OK' }}
          </button>
        }
      </footer>
    }
  `,
  styles: `
    .z-dialog-backdrop {
      background: color-mix(in srgb, var(--background) 84%, transparent);
      backdrop-filter: blur(2px);
    }

    :host {
      opacity: 1;
      transform: scale(1);
      transition:
        opacity 150ms ease-out,
        transform 150ms ease-out;
    }

    @starting-style {
      :host {
        opacity: 0;
        transform: scale(0.9);
      }
    }

    :host.dialog-leave {
      opacity: 0;
      transform: scale(0.9);
      transition:
        opacity 150ms ease-in,
        transform 150ms ease-in;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[style.width]': 'config.zWidth ? config.zWidth : null',
    'animate.enter': 'dialog-enter',
    'animate.leave': 'dialog-leave',
  },
  exportAs: 'zDialog',
})
export class ZardDialogComponent<T, U> extends BasePortalOutlet {
  private readonly host = inject(ElementRef<HTMLElement>)
  protected readonly config = inject(ZardDialogOptions<T, U>)

  protected readonly classes = computed(() =>
    mergeClasses(dialogVariants(), this.config.zCustomClasses),
  )
  dialogRef?: ZardDialogRef<T>

  protected readonly isStringContent = typeof this.config.zContent === 'string'

  readonly portalOutlet = viewChild.required(CdkPortalOutlet)

  okTriggered = output<void>()
  cancelTriggered = output<void>()

  constructor() {
    super()
  }

  getNativeElement(): HTMLElement {
    return this.host.nativeElement
  }

  attachComponentPortal<T>(portal: ComponentPortal<T>): ComponentRef<T> {
    if (this.portalOutlet()?.hasAttached()) {
      throw new Error(
        'Attempting to attach modal content after content is already attached',
      )
    }
    return this.portalOutlet()?.attachComponentPortal(portal)
  }

  attachTemplatePortal<C>(portal: TemplatePortal<C>): EmbeddedViewRef<C> {
    if (this.portalOutlet()?.hasAttached()) {
      throw new Error(
        'Attempting to attach modal content after content is already attached',
      )
    }

    return this.portalOutlet()?.attachTemplatePortal(portal)
  }

  onOkClick() {
    this.okTriggered.emit()
  }

  onCloseClick() {
    this.cancelTriggered.emit()
  }
}

@NgModule({
  imports: [
    ZardButtonComponent,
    ZardDialogComponent,
    OverlayModule,
    PortalModule,
  ],
  providers: [ZardDialogService],
})
export class ZardDialogModule {}
