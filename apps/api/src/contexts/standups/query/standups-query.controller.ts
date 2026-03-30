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
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import type { StandupStatus } from '../../../shared/domain'
import {
  StandupDetailResponseDto,
  StandupListResponseDto,
} from '../../../shared/openapi/response-dtos'
import { StandupsQueryService } from './standups-query.service'

const STANDUP_STATUS_QUERY = {
  draft: 'draft',
  pending_review: 'pending_review',
  approved: 'approved',
  rejected: 'rejected',
  published: 'published',
} as const

@ApiTags('standups')
@Controller('standups')
export class StandupsQueryController {
  constructor(private readonly standupsQuery: StandupsQueryService) {}

  @Get()
  @ApiOperation({
    operationId: 'listStandups',
    summary: 'Lista standups do usuário autenticado',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: Object.values(STANDUP_STATUS_QUERY),
  })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    example: 20,
    description: 'Max: 100',
  })
  @ApiOkResponse({
    description: 'Lista paginada de standups.',
    type: StandupListResponseDto,
  })
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
  @ApiOperation({
    operationId: 'getStandupById',
    summary: 'Busca um standup pelo identificador',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({
    description: 'Standup encontrado.',
    type: StandupDetailResponseDto,
  })
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
