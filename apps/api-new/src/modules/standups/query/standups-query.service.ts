import { Injectable } from '@nestjs/common'
import {
  type ListStandupFilters,
  StandupRepository,
} from '../../../shared/database/repositories/standup.repository'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

@Injectable()
export class StandupsQueryService {
  constructor(private readonly standupRepository: StandupRepository) {}

  async list(userId: string, filters: Omit<ListStandupFilters, 'userId'>) {
    const result = await this.standupRepository.list({
      ...filters,
      userId,
    })

    if (result.isErr()) {
      throwStandupHttpError(result.error)
    }

    return result.value
  }

  async getById(userId: string, id: string) {
    const result = await this.standupRepository.findByIdForUser(id, userId)

    if (result.isErr()) {
      throwStandupHttpError(result.error)
    }

    return result.value
  }
}
