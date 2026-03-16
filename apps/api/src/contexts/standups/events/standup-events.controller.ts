import type { ServerResponse } from 'node:http'
import {
  Controller,
  Get,
  type MessageEvent,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger'
import { Session } from '@thallesp/nestjs-better-auth'
import { StandupSseBusService } from './standup-sse-bus.service'

type AuthSession = {
  user: {
    id: string
  }
}

type ExpressLikeRequest = {
  res?: unknown
}

function isServerResponse(value: unknown): value is ServerResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'write' in value &&
    typeof value.write === 'function' &&
    'writeHead' in value &&
    typeof value.writeHead === 'function'
  )
}

/**
 * Formats a MessageEvent as an SSE text frame.
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function formatSseEvent(event: MessageEvent): string {
  let frame = ''
  if (event.type) frame += `event: ${event.type}\n`
  if (event.id) frame += `id: ${event.id}\n`
  if (event.retry) frame += `retry: ${event.retry}\n`
  const data =
    typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
  for (const line of data.split('\n')) {
    frame += `data: ${line}\n`
  }
  frame += '\n'
  return frame
}

@ApiTags('standups')
@Controller('standups')
export class StandupEventsController {
  constructor(private readonly standupSseBus: StandupSseBusService) {}

  /**
   * SSE endpoint. On Hono, this controller is NOT used at runtime — the route
   * is mounted directly on the Hono instance in main.ts to avoid the
   * res.write() / writeHead incompatibility. This controller still exists for:
   * - OpenAPI documentation generation
   * - Express-based test harness (supertest)
   */
  @Get('events')
  @ApiOperation({
    operationId: 'streamStandupEvents',
    summary: 'Abre o stream SSE de eventos de standup',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Stream SSE aberto com sucesso.' })
  stream(
    @Session() session: AuthSession | null,
    @Req() req: ExpressLikeRequest,
    @Res() res: unknown,
  ): void {
    const userId = session?.user.id
    if (!userId) {
      throw new UnauthorizedException()
    }

    // Express path (used in tests): req.res or res itself is the ServerResponse
    const nodeRes = isServerResponse(res)
      ? res
      : isServerResponse(req.res)
        ? req.res
        : null

    if (!nodeRes?.write) {
      throw new Error(
        'SSE requires a Node.js ServerResponse (unsupported HTTP adapter)',
      )
    }

    nodeRes.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const subscription = this.standupSseBus.subscribe(userId).subscribe({
      next: (event) => {
        nodeRes.write(formatSseEvent(event))
      },
      error: () => {
        nodeRes.end()
      },
      complete: () => {
        nodeRes.end()
      },
    })

    nodeRes.on('close', () => {
      subscription.unsubscribe()
    })
  }
}
