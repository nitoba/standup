import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ListWorkerReposService } from './list-worker-repos.service'

@ApiTags('repos')
@Controller('repos')
export class ReposController {
  constructor(private readonly listWorkerRepos: ListWorkerReposService) {}

  @Get()
  @ApiOperation({
    operationId: 'listRepos',
    summary: 'Lista os repositórios disponíveis para coleta',
  })
  @ApiOkResponse({ description: 'Lista de repositórios configurados.' })
  async list() {
    const result = await this.listWorkerRepos.listRepos()

    if (result.isErr()) {
      throw new ServiceUnavailableException(result.error.message)
    }

    return { data: result.value }
  }
}
