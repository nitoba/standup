import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import type { StandupStatus } from '../../../shared/domain'
import { StandupsQueryService } from './standups-query.service'

const STANDUP_STATUS_QUERY = {
  draft: 'draft',
  pending_review: 'pending_review',
  approved: 'approved',
  rejected: 'rejected',
  published: 'published',
} as const

@Controller('standups')
export class StandupsQueryController {
  constructor(private readonly standupsQuery: StandupsQueryService) {}

  @Get()
  async list(
    @Session() session: AuthSession | null,
    @Query(
      'status',
      new ParseEnumPipe(STANDUP_STATUS_QUERY, { optional: true }),
    )
    status: StandupStatus | undefined,
    @Query('date') date: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('search') search: string | undefined,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    const userId = requireSessionUserId(session)
    const result = await this.standupsQuery.list(userId, {
      status,
      date,
      from,
      to,
      search,
      page,
      pageSize,
    })

    return {
      data: result.items,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      summary: result.summary,
    }
  }

  @Get(':id')
  async getById(
    @Session() session: AuthSession | null,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const userId = requireSessionUserId(session)

    return {
      data: await this.standupsQuery.getById(userId, id),
    }
  }
}
