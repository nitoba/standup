import { HttpClient, httpResource } from '@angular/common/http'
import { computed, Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'

import { METRIC_CHANGES } from '../data/mock-data'
import type { DashboardMetrics, Standup, StandupStatus } from '../types/standup'

@Injectable({ providedIn: 'root' })
export class StandupService {
  private readonly http = inject(HttpClient)

  readonly standups = httpResource<Standup[]>(() => '/api/standups', {
    defaultValue: [],
  })

  readonly metrics = computed<DashboardMetrics>(() => {
    const counts = this.standups.value().reduce(
      (acc, standup) => {
        acc.total += 1
        if (standup.status === 'approved') acc.approved += 1
        if (standup.status === 'pending_review') acc.pending += 1
        if (standup.status === 'rejected') acc.rejected += 1
        return acc
      },
      { total: 0, approved: 0, pending: 0, rejected: 0 },
    )

    return {
      total: { count: counts.total, change: METRIC_CHANGES.total },
      approved: { count: counts.approved, change: METRIC_CHANGES.approved },
      pending: { count: counts.pending, change: METRIC_CHANGES.pending },
      rejected: { count: counts.rejected, change: METRIC_CHANGES.rejected },
    }
  })

  getStandupById(id: () => string | undefined) {
    return httpResource<Standup>(() => {
      const value = id()
      return value ? `/api/standups/${value}` : undefined
    })
  }

  approve(id: string) {
    return this.updateStatus(id, 'approved')
  }

  reject(id: string) {
    return this.updateStatus(id, 'rejected')
  }

  regenerate(id: string) {
    return this.updateStatus(id, 'pending_review')
  }

  private async updateStatus(id: string, status: StandupStatus) {
    await firstValueFrom(
      this.http.patch(`/api/standups/${id}/status`, {
        status,
      }),
    )
    this.standups.reload()
  }
}
