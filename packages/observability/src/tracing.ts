import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

let sdk: NodeSDK | undefined

/**
 * Initializes OpenTelemetry tracing for the current process.
 * Must be called once at the very top of the app entrypoint, before any other imports.
 *
 * Tracing is enabled only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
 * When disabled, no-ops gracefully (zero overhead).
 */
export function initTracing(
  serviceName: string,
  serviceVersion = '0.0.0',
): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint) {
    return
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    'deployment.environment.name': process.env.NODE_ENV ?? 'development',
  })

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  })

  sdk = new NodeSDK({
    resource,
    spanProcessor: new BatchSpanProcessor(traceExporter),
  })

  sdk.start()
}

/**
 * Gracefully shuts down the OTel SDK, flushing pending spans.
 * Call this on process exit if needed.
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
  }
}
