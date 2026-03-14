import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { shutdownOpenTelemetry } from './tracing'

@Injectable()
export class ObservabilityShutdownService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownOpenTelemetry()
  }
}
