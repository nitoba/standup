import { HttpClient } from '@angular/common/http'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core'
import { RouterLink } from '@angular/router'
import { injectQuery } from '@tanstack/angular-query-experimental'
import { firstValueFrom } from 'rxjs'
import { getListStandupsQueryKey } from '../../api/endpoints/standups/standups'
import { SidebarLayout } from '../../core/layout/sidebar'
import type {
  StandupDto,
  StandupListResponseDto,
  StandupStatus,
} from '../../shared/models/standup-models'
import { normalizeDisplayDate } from '../../shared/utils'

interface WeekStandup {
  id: string
  date: string
  status: StandupStatus
  content: string
}

function mapStatus(status: string): StandupStatus {
  if (status === 'rejected') return 'rejected'
  if (status === 'approved' || status === 'published') return 'approved'
  return 'pending_review'
}

function formatDisplayDate(dateStr: string): string {
  return normalizeDisplayDate(dateStr)
}

@Component({
  selector: 'app-weekly-digest-page',
  imports: [SidebarLayout, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="bg-background text-foreground p-[20px] md:p-[40px] flex flex-col gap-[24px] md:gap-[32px]">
        <a
          routerLink="/dashboard"
          class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] flex items-center gap-[12px] transition-colors duration-150 hover:text-foreground"
        >
          <span><<</span>
          <span>voltar para standups</span>
        </a>

        <div class="flex flex-col gap-[8px]">
          <div class="flex items-center gap-[12px]">
            <span class="text-primary font-[var(--font-jetbrains)] text-[24px] md:text-[32px] font-bold">>></span>
            <span class="text-foreground font-[var(--font-jetbrains)] text-[20px] md:text-[28px] font-bold">resumo_semanal</span>
          </div>
          @if (periodLabel()) {
            <div class="text-muted-foreground font-[var(--font-ibm)] text-[13px]">
              // {{ periodLabel() }}
            </div>
          }
        </div>

        @if (standups.isPending()) {
          <div class="flex flex-col gap-[16px]">
            @for (i of skeletonItems; track i) {
              <div class="bg-card border border-border p-[16px] md:p-[24px] flex flex-col gap-[12px] animate-pulse">
                <div class="h-[14px] w-[120px] bg-muted rounded"></div>
                <div class="h-[12px] w-full bg-muted rounded"></div>
                <div class="h-[12px] w-[80%] bg-muted rounded"></div>
                <div class="h-[12px] w-[60%] bg-muted rounded"></div>
              </div>
            }
          </div>
        } @else if (standups.error()) {
          <div class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]">
            // falha ao carregar standups da semana
          </div>
        } @else if (weekStandups().length === 0) {
          <div class="bg-card border border-border p-[24px] flex flex-col gap-[8px]">
            <div class="text-muted-foreground font-[var(--font-jetbrains)] text-[13px]">
              // nenhum standup aprovado encontrado neste período
            </div>
            @if (from() && to()) {
              <div class="text-muted-foreground/60 font-[var(--font-ibm)] text-[12px]">
                {{ from() }} → {{ to() }}
              </div>
            }
          </div>
        } @else {
          <div class="flex flex-col gap-[4px] text-muted-foreground font-[var(--font-ibm)] text-[12px]">
            <span>// {{ weekStandups().length }} standup{{ weekStandups().length === 1 ? '' : 's' }} encontrado{{ weekStandups().length === 1 ? '' : 's' }}</span>
          </div>

          <div class="flex flex-col gap-[24px]">
            @for (standup of weekStandups(); track standup.id) {
              <div class="bg-card border border-border flex flex-col gap-[0]">
                <div class="flex items-center justify-between gap-[12px] px-[16px] md:px-[24px] py-[12px] border-b border-border">
                  <div class="flex items-center gap-[12px]">
                    <span class="text-primary font-[var(--font-jetbrains)] text-[11px] font-bold uppercase tracking-[0.12em]">
                      {{ formatDisplayDate(standup.date) }}
                    </span>
                    <span class="text-muted-foreground/60 font-[var(--font-ibm)] text-[11px]">
                      {{ formatDisplayDate(standup.date) }}
                    </span>
                  </div>
                  <div class="flex items-center gap-[8px]">
                    <span
                      class="h-[6px] w-[6px] rounded-full"
                      [class]="statusDotClass(standup.status)"
                    ></span>
                    <span
                      class="font-[var(--font-jetbrains)] text-[11px]"
                      [class]="statusTextClass(standup.status)"
                    >
                      {{ formatStatus(standup.status) }}
                    </span>
                  </div>
                </div>
                <div class="px-[16px] md:px-[24px] py-[16px] md:py-[20px]">
                  <pre class="m-0 whitespace-pre-wrap break-words font-[var(--font-ibm)] text-[13px] leading-[1.7] text-foreground">{{ standup.content }}</pre>
                </div>
                <div class="px-[16px] md:px-[24px] py-[10px] border-t border-border">
                  <a
                    [routerLink]="['/standups', standup.id]"
                    class="text-muted-foreground font-[var(--font-jetbrains)] text-[11px] transition-colors duration-150 hover:text-foreground"
                  >
                    $ ver detalhes →
                  </a>
                </div>
              </div>
            }
          </div>
        }
      </section>
    </app-sidebar-layout>
  `,
})
export class WeeklyDigestPage {
  private readonly http = inject(HttpClient)

  readonly from = input<string>()
  readonly to = input<string>()

  readonly skeletonItems = [1, 2, 3]

  readonly standups = injectQuery(() => {
    const fromDate = this.from()
    const toDate = this.to()
    const params: Record<string, string> = {
      status: 'approved',
      pageSize: '100',
    }
    if (fromDate) params['from'] = fromDate
    if (toDate) params['to'] = toDate

    return {
      queryKey: [...getListStandupsQueryKey(), 'weekly-digest', params],
      queryFn: async () => {
        const response = await firstValueFrom(
          this.http.get<StandupListResponseDto>('/standups', { params }),
        )
        return response.data.map(
          (dto: StandupDto): WeekStandup => ({
            id: dto.id,
            date: dto.date,
            status: mapStatus(dto.status),
            content: dto.content,
          }),
        )
      },
    }
  })

  readonly weekStandups = computed<WeekStandup[]>(
    () => this.standups.data() ?? [],
  )

  readonly periodLabel = computed(() => {
    const from = this.from()
    const to = this.to()
    if (!from && !to) return null
    if (from && to) {
      return `${formatDisplayDate(from)} a ${formatDisplayDate(to)}`
    }
    return from
      ? `a partir de ${formatDisplayDate(from)}`
      : `até ${formatDisplayDate(to ?? '')}`
  })

  formatDisplayDate(dateStr: string): string {
    return formatDisplayDate(dateStr)
  }

  statusDotClass(status: StandupStatus): string {
    if (status === 'approved') return 'bg-primary'
    if (status === 'pending_review') return 'bg-[var(--accent-yellow)]'
    return 'bg-[var(--accent-red)]'
  }

  statusTextClass(status: StandupStatus): string {
    if (status === 'approved') return 'text-primary'
    if (status === 'pending_review') return 'text-[var(--accent-yellow)]'
    return 'text-[var(--accent-red)]'
  }

  formatStatus(status: StandupStatus): string {
    if (status === 'pending_review') return '[pendente]'
    return status === 'approved' ? '[aprovado]' : '[rejeitado]'
  }
}
