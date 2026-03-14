import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ListWorkerReposService } from './list-worker-repos.service'

@Controller('repos')
export class ReposController {
  constructor(private readonly listWorkerRepos: ListWorkerReposService) {}

  @Get()
  async list() {
    const result = await this.listWorkerRepos.listRepos()

    if (result.isErr()) {
      throw new ServiceUnavailableException(result.error.message)
    }

    return { data: result.value }
  }
}
