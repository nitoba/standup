import { ChangeDetectionStrategy, Component } from '@angular/core'

import { ZardSkeletonComponent } from '@/shared/components/skeleton'

@Component({
  selector: 'app-dashboard-skeleton',
  imports: [ZardSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Metric cards grid: 2 cols on mobile, 4 on desktop -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-[16px] md:gap-[24px]">
      @for (card of cards; track card) {
        <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[12px]">
          <!-- dot + label -->
          <div class="flex items-center gap-[8px]">
            <z-skeleton class="h-[6px] w-[6px] rounded-full flex-shrink-0" />
            <z-skeleton class="h-[12px] w-[80px]" />
          </div>
          <!-- value -->
          <z-skeleton class="h-[28px] w-[48px]" />
          <!-- change -->
          <z-skeleton class="h-[12px] w-[64px]" />
        </div>
      }
    </div>

    <!-- Filter bar -->
    <div class="flex flex-col gap-[16px]">
      <z-skeleton class="h-[12px] w-[64px]" />
      <div class="flex flex-wrap gap-[10px]">
        <z-skeleton class="h-[44px] w-full md:w-[210px]" />
        <z-skeleton class="h-[44px] w-full md:w-[210px]" />
        <z-skeleton class="h-[44px] w-full md:w-[170px]" />
        <z-skeleton class="h-[44px] w-full md:flex-1" />
      </div>
    </div>

    <!-- Table header (desktop only) -->
    <div class="hidden md:grid grid-cols-[120px_120px_1fr_100px] gap-[12px] px-[16px] py-[10px] border-b border-border">
      @for (col of tableHeaders; track col) {
        <z-skeleton class="h-[12px]" [class]="col" />
      }
    </div>

    <!-- Table rows -->
    <div class="flex flex-col gap-[2px]">
      @for (row of rows; track row) {
        <!-- Desktop row -->
        <div class="hidden md:grid grid-cols-[120px_120px_1fr_100px] gap-[12px] items-center px-[16px] py-[14px] border border-border bg-card">
          <z-skeleton class="h-[13px] w-[90px]" />
          <div class="flex items-center gap-[8px]">
            <z-skeleton class="h-[6px] w-[6px] rounded-full flex-shrink-0" />
            <z-skeleton class="h-[13px] w-[80px]" />
          </div>
          <z-skeleton class="h-[13px] w-full max-w-[320px]" />
          <z-skeleton class="h-[32px] w-[72px]" />
        </div>
        <!-- Mobile card -->
        <div class="md:hidden flex flex-col gap-[12px] p-[16px] border border-border bg-card">
          <div class="flex items-center justify-between">
            <z-skeleton class="h-[13px] w-[90px]" />
            <div class="flex items-center gap-[6px]">
              <z-skeleton class="h-[6px] w-[6px] rounded-full flex-shrink-0" />
              <z-skeleton class="h-[12px] w-[70px]" />
            </div>
          </div>
          <z-skeleton class="h-[13px] w-full" />
          <z-skeleton class="h-[32px] w-[80px]" />
        </div>
      }
    </div>

    <!-- Pagination footer -->
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-[12px] pt-[8px]">
      <z-skeleton class="h-[13px] w-[140px]" />
      <div class="flex items-center gap-[4px]">
        @for (page of pageButtons; track page) {
          <z-skeleton class="h-[32px] w-[32px]" />
        }
      </div>
    </div>
  `,
})
export class DashboardSkeleton {
  readonly cards = [1, 2, 3, 4]
  readonly tableHeaders = ['w-[80px]', 'w-[60px]', 'w-[120px]', 'w-[60px]']
  readonly rows = [1, 2, 3, 4, 5]
  readonly pageButtons = [1, 2, 3, 4, 5]
}
