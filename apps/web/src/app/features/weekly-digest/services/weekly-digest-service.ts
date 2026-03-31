import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { listStandups } from '../../../api/endpoints/standups/standups'
import type {
  ListStandupsParams,
  StandupListResponseDto,
} from '../../../api/model'
import type { StandupStatus } from '../../../shared/models/standup-models'
import { normalizeDisplayDate } from '../../../shared/utils'

export interface WeekStandup {
  id: string
  date: string
  status: StandupStatus
  content: string
}

function mapStatus(status: string): StandupStatus {
  if (status === 'published') return 'published'
  if (status === 'rejected') return 'rejected'
  if (status === 'approved') return 'approved'
  return 'pending_review'
}

@Injectable({ providedIn: 'root' })
export class WeeklyDigestService {
  private readonly http = inject(HttpClient)

  async listApprovedStandups(filters: {
    from?: string
    to?: string
  }): Promise<WeekStandup[]> {
    const params: ListStandupsParams = {
      status: 'approved',
      pageSize: 100,
    }
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to

    const response: StandupListResponseDto = await listStandups(
      this.http,
      params,
    )

    return response.data.map((dto) => ({
      id: dto.id,
      date: normalizeDisplayDate(dto.date),
      status: mapStatus(dto.status),
      content: dto.content,
    }))
  }
}
