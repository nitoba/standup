import { Global, Module } from '@nestjs/common'
import { OpenTelemetryModule } from 'nestjs-otel'
import { AppTracingService } from './app-tracing.service'
import { ObservabilityShutdownService } from './observability-shutdown.service'

@Global()
@Module({
  imports: [OpenTelemetryModule.forRoot()],
  providers: [AppTracingService, ObservabilityShutdownService],
  exports: [OpenTelemetryModule, AppTracingService],
})
export class ObservabilityModule {}
