import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  Injector,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core'
import { ZardButtonComponent } from '../../shared/components/button'
import { Z_MODAL_DATA, ZardDialogRef } from '../../shared/components/dialog'
import { ZardIconComponent } from '../../shared/components/icon'
import { ZardInputDirective } from '../../shared/components/input'
import type { StandupCustomEntriesDto } from '../../types/standup'

export interface ApproveDialogSubmitPayload {
  customEntries: StandupCustomEntriesDto | null
}

export interface ApproveDialogData {
  initialEntries: StandupCustomEntriesDto | null
  onSubmit(payload: ApproveDialogSubmitPayload): void
}

type EntryGroup = 'scheduledMeetings' | 'directCalls'

function normalizeEntries(lines: string[] | undefined): string[] {
  if (!lines || lines.length === 0) {
    return ['']
  }

  return lines.length > 0 ? [...lines] : ['']
}

function cleanEntries(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter((line) => line.length > 0)
}

@Component({
  selector: 'app-approve-dialog-content',
  imports: [ZardButtonComponent, ZardIconComponent, ZardInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #dialogRoot class="flex flex-col gap-[20px]">
      <div class="flex flex-col gap-[10px] border border-border bg-background/40 p-[12px]">
        <div class="flex items-center justify-between gap-[12px]">
          <label
            for="scheduled-meetings-0"
            class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
          >
          scheduled_meetings
          </label>
          <button
            type="button"
            z-button
            zType="ghost"
            zSize="sm"
            class="h-[32px] w-[32px] px-0"
            aria-label="Add scheduled meeting"
            (click)="addEntry('scheduledMeetings')"
          >
            <z-icon zType="plus" zSize="sm" />
          </button>
        </div>
        <div class="flex flex-col gap-[8px]">
          @for (meeting of scheduledMeetings(); track $index) {
            <div class="flex items-center gap-[8px]">
              <input
                [id]="'scheduled-meetings-' + $index"
                z-input
                class="flex-1"
                placeholder="Planning Backend"
                [attr.aria-label]="'Scheduled meeting ' + ($index + 1)"
                [value]="meeting"
                (input)="updateEntry('scheduledMeetings', $index, asInputValue($event))"
              />
              @if (scheduledMeetings().length > 1) {
                <button
                  type="button"
                  z-button
                  zType="ghost"
                  zSize="sm"
                  class="h-[40px] w-[40px] shrink-0 px-0"
                  [attr.aria-label]="'Remove scheduled meeting ' + ($index + 1)"
                  (click)="removeEntry('scheduledMeetings', $index)"
                >
                  <z-icon zType="minus" zSize="sm" />
                </button>
              }
            </div>
          }
        </div>
        <span class="text-muted-foreground/70 font-[var(--font-ibm)] text-[11px]">
          // cada item sera inserido como uma reuniao extra
        </span>
      </div>

      <div class="flex flex-col gap-[10px] border border-border bg-background/40 p-[12px]">
        <div class="flex items-center justify-between gap-[12px]">
          <label
            for="direct-calls-0"
            class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
          >
          direct_calls
          </label>
          <button
            type="button"
            z-button
            zType="ghost"
            zSize="sm"
            class="h-[32px] w-[32px] px-0"
            aria-label="Add direct call"
            (click)="addEntry('directCalls')"
          >
            <z-icon zType="plus" zSize="sm" />
          </button>
        </div>
        <div class="flex flex-col gap-[8px]">
          @for (call of directCalls(); track $index) {
            <div class="flex items-center gap-[8px]">
              <input
                [id]="'direct-calls-' + $index"
                z-input
                class="flex-1"
                placeholder="Call com Joao sobre deploy"
                [attr.aria-label]="'Direct call ' + ($index + 1)"
                [value]="call"
                (input)="updateEntry('directCalls', $index, asInputValue($event))"
              />
              @if (directCalls().length > 1) {
                <button
                  type="button"
                  z-button
                  zType="ghost"
                  zSize="sm"
                  class="h-[40px] w-[40px] shrink-0 px-0"
                  [attr.aria-label]="'Remove direct call ' + ($index + 1)"
                  (click)="removeEntry('directCalls', $index)"
                >
                  <z-icon zType="minus" zSize="sm" />
                </button>
              }
            </div>
          }
        </div>
        <span class="text-muted-foreground/70 font-[var(--font-ibm)] text-[11px]">
          // cada item sera adicionado no final do standup
        </span>
      </div>

      <div class="flex flex-col-reverse gap-[12px] md:flex-row md:justify-end pt-[4px]">
        <button type="button" z-button zType="outline" class="md:min-w-[140px]" (click)="onCancel()">
          $ cancelar
        </button>

        <button type="button" z-button zType="default" class="md:min-w-[180px]" (click)="onSubmit()">
          $ aprovar e publicar
        </button>
      </div>
    </div>
  `,
})
export class ApproveDialogContent {
  private readonly injector = inject(Injector)
  private readonly dialogRef = inject(ZardDialogRef<ApproveDialogContent>)
  private readonly data = inject<ApproveDialogData>(Z_MODAL_DATA)

  readonly initialEntries = linkedSignal(() => this.data.initialEntries)
  readonly scheduledMeetings = linkedSignal(() =>
    normalizeEntries(this.initialEntries()?.scheduledMeetings),
  )
  readonly directCalls = linkedSignal(() =>
    normalizeEntries(this.initialEntries()?.directCalls),
  )
  readonly hasCustomEntries = computed(() => {
    return (
      cleanEntries(this.scheduledMeetings()).length > 0 ||
      cleanEntries(this.directCalls()).length > 0
    )
  })
  readonly dialogRoot =
    viewChild.required<ElementRef<HTMLDivElement>>('dialogRoot')

  constructor() {
    afterNextRender(
      () => {
        this.dialogRoot()
          .nativeElement.querySelector<HTMLInputElement>(
            '#scheduled-meetings-0',
          )
          ?.focus()
      },
      { injector: this.injector },
    )
  }

  onCancel() {
    this.dialogRef.close()
  }

  onSubmit() {
    const customEntries = this.hasCustomEntries()
      ? {
          scheduledMeetings: cleanEntries(this.scheduledMeetings()),
          directCalls: cleanEntries(this.directCalls()),
        }
      : null

    this.dialogRef.close()
    this.data.onSubmit({ customEntries })
  }

  addEntry(group: EntryGroup) {
    this[group].update((entries) => [...entries, ''])
  }

  updateEntry(group: EntryGroup, index: number, value: string) {
    this[group].update((entries) =>
      entries.map((entry, currentIndex) =>
        currentIndex === index ? value : entry,
      ),
    )
  }

  removeEntry(group: EntryGroup, index: number) {
    this[group].update((entries) => {
      if (entries.length === 1) {
        return entries
      }

      return entries.filter((_, currentIndex) => currentIndex !== index)
    })
  }

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value
  }
}
