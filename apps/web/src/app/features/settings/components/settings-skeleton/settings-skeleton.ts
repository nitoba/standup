import { ChangeDetectionStrategy, Component } from '@angular/core'

import { ZardSkeletonComponent } from '@/shared/components/skeleton'

@Component({
  selector: 'app-settings-skeleton',
  imports: [ZardSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[32px]">
      <!-- // schedule section -->
      <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]">
        <!-- section header -->
        <div class="flex items-center gap-[8px]">
          <z-skeleton class="h-[14px] w-[16px]" />
          <z-skeleton class="h-[14px] w-[72px]" />
        </div>
        <!-- row 1: standup_cron + reminder_cron -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]">
          @for (field of scheduleRow1; track field) {
            <div class="flex flex-col gap-[6px]">
              <z-skeleton class="h-[12px] w-[100px]" />
              <z-skeleton class="h-[40px] w-full" />
            </div>
          }
        </div>
        <!-- row 2: recovery_cron + timezone -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]">
          @for (field of scheduleRow2; track field) {
            <div class="flex flex-col gap-[6px]">
              <z-skeleton class="h-[12px] w-[100px]" />
              <z-skeleton class="h-[40px] w-full" />
            </div>
          }
        </div>
      </div>

      <!-- // git_configuration section -->
      <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]">
        <div class="flex items-center gap-[8px]">
          <z-skeleton class="h-[14px] w-[16px]" />
          <z-skeleton class="h-[14px] w-[130px]" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]">
          <div class="flex flex-col gap-[6px]">
            <z-skeleton class="h-[12px] w-[80px]" />
            <z-skeleton class="h-[40px] w-full" />
          </div>
        </div>
      </div>

      <!-- // selected_repositories section -->
      <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]">
        <div class="flex items-center gap-[8px]">
          <z-skeleton class="h-[14px] w-[16px]" />
          <z-skeleton class="h-[14px] w-[170px]" />
        </div>
        <div class="flex flex-col gap-[4px]">
          @for (repo of repoRows; track repo) {
            <div class="border border-border px-[12px] py-[10px] flex items-center gap-[12px]">
              <!-- checkbox -->
              <z-skeleton class="h-[16px] w-[16px] rounded-sm flex-shrink-0" />
              <div class="flex items-center gap-[8px] flex-1">
                <z-skeleton class="h-[13px] w-[20px]" />
                <z-skeleton class="h-[13px]" [class]="repo.name" />
              </div>
              <z-skeleton class="h-[11px]" [class]="repo.project" />
            </div>
          }
        </div>
      </div>

      <!-- // automation section -->
      <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]">
        <div class="flex items-center gap-[8px]">
          <z-skeleton class="h-[14px] w-[16px]" />
          <z-skeleton class="h-[14px] w-[90px]" />
        </div>
        <div class="flex items-center justify-between">
          <div class="flex flex-col gap-[4px]">
            <z-skeleton class="h-[13px] w-[50px]" />
            <z-skeleton class="h-[12px] w-[200px]" />
          </div>
          <!-- switch -->
          <z-skeleton class="h-[24px] w-[44px] rounded-full" />
        </div>
      </div>

      <!-- save button -->
      <div class="flex justify-end">
        <z-skeleton class="h-[40px] w-full md:w-[140px]" />
      </div>
    </div>
  `,
})
export class SettingsSkeleton {
  readonly scheduleRow1 = [1, 2]
  readonly scheduleRow2 = [1, 2]
  readonly repoRows = [
    { name: 'w-[100px]', project: 'w-[60px]' },
    { name: 'w-[130px]', project: 'w-[80px]' },
    { name: 'w-[90px]', project: 'w-[70px]' },
    { name: 'w-[115px]', project: 'w-[65px]' },
  ]
}
