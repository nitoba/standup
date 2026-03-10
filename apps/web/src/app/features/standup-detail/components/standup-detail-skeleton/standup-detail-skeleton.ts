import { ChangeDetectionStrategy, Component } from '@angular/core'

import { ZardSkeletonComponent } from '@/shared/components/skeleton'

@Component({
  selector: 'app-standup-detail-skeleton',
  imports: [ZardSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Title block -->
    <div class="flex flex-col gap-[16px]">
      <!-- >> standup_detail heading -->
      <div class="flex items-center gap-[12px]">
        <z-skeleton class="h-[32px] w-[24px]" />
        <z-skeleton class="h-[28px] md:h-[32px] w-[220px] md:w-[280px]" />
      </div>
      <!-- Metadata row: date + status + createdAt + id -->
      <div class="flex flex-wrap items-center gap-[12px] md:gap-[24px]">
        <z-skeleton class="h-[12px] w-[80px]" />
        <div class="flex items-center gap-[8px]">
          <z-skeleton class="h-[6px] w-[6px] rounded-full flex-shrink-0" />
          <z-skeleton class="h-[12px] w-[90px]" />
        </div>
        <z-skeleton class="hidden md:block h-[12px] w-[120px]" />
        <z-skeleton class="hidden md:block h-[12px] w-[180px]" />
      </div>
    </div>

    <!-- generated_content card -->
    <div class="bg-card border border-border p-[16px] md:p-[24px] flex flex-col gap-[16px] md:gap-[20px]">
      <!-- card header -->
      <div class="flex flex-col gap-[8px] md:flex-row md:items-center md:justify-between">
        <z-skeleton class="h-[14px] w-[160px]" />
        <z-skeleton class="h-[32px] w-[140px]" />
      </div>
      <!-- pre content lines -->
      <div class="flex flex-col gap-[8px]">
        @for (line of contentLines; track line) {
          <z-skeleton class="h-[13px]" [class]="line" />
        }
      </div>
    </div>

    <!-- datasource block -->
    <div class="border border-border p-[20px] flex flex-col gap-[20px]">
      <!-- header -->
      <div class="flex flex-col gap-[8px] md:flex-row md:items-center md:justify-between">
        <z-skeleton class="h-[14px] w-[100px]" />
        <z-skeleton class="h-[32px] w-[140px]" />
      </div>

      <!-- repo entries -->
      <div class="flex flex-col gap-[20px]">
        @for (repo of repos; track repo) {
          <div class="flex flex-col gap-[8px]">
            <!-- repo name (green) -->
            <z-skeleton class="h-[13px] w-[120px]" />
            <!-- commits -->
            @for (commit of repo.commits; track commit) {
              <div class="flex gap-[12px] pl-[16px]">
                <z-skeleton class="h-[12px] w-[56px] flex-shrink-0" />
                <z-skeleton class="h-[12px]" [class]="commit" />
              </div>
            }
          </div>
        }
      </div>

      <!-- JSON preview panel -->
      <div class="border border-border bg-card p-[16px] flex flex-col gap-[12px]">
        <div class="flex items-center justify-between gap-[12px]">
          <div class="flex items-center gap-[12px]">
            <z-skeleton class="h-[11px] w-[50px]" />
            <z-skeleton class="h-[12px] w-[40px]" />
          </div>
          <z-skeleton class="h-[32px] w-[80px]" />
        </div>
        <!-- json preview lines -->
        <div class="flex flex-col gap-[6px]">
          @for (line of jsonLines; track line) {
            <z-skeleton class="h-[12px]" [class]="line" />
          }
        </div>
      </div>
    </div>

    <!-- Action buttons row -->
    <div class="flex flex-col md:flex-row items-stretch md:items-center gap-[12px] md:gap-[16px]">
      <z-skeleton class="h-[40px] w-full md:w-[100px]" />
      <z-skeleton class="h-[40px] w-full md:w-[90px]" />
      <z-skeleton class="h-[40px] w-full md:w-[90px]" />
    </div>
  `,
})
export class StandupDetailSkeleton {
  readonly contentLines = [
    'w-full',
    'w-[92%]',
    'w-full',
    'w-[85%]',
    'w-[95%]',
    'w-full',
    'w-[78%]',
    'w-full',
    'w-[88%]',
    'w-[60%]',
  ]

  readonly repos = [
    { commits: ['w-[240px]', 'w-[200px]', 'w-[260px]'] },
    { commits: ['w-[210px]', 'w-[190px]'] },
  ]

  readonly jsonLines = [
    'w-full',
    'w-[90%]',
    'w-[95%]',
    'w-[80%]',
    'w-full',
    'w-[75%]',
    'w-[88%]',
    'w-[50%]',
  ]
}
