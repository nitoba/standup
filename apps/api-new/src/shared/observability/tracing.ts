import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

const SERVICE_NAME = 'standup-api-new'
const SERVICE_VERSION = '0.0.1'

let sdk: NodeSDK | null = null
let startPromise: Promise<void> | null = null

function normalizeEndpoint(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint
}

export async function startOpenTelemetry(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()

  if (!endpoint) {
    return
  }

  if (startPromise) {
    await startPromise
    return
  }

  startPromise = (async () => {
    const exporter = new OTLPTraceExporter({
      url: `${normalizeEndpoint(endpoint)}/v1/traces`,
    })

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
        'deployment.environment.name': process.env.NODE_ENV ?? 'development',
      }),
      spanProcessors: [new BatchSpanProcessor(exporter)],
      instrumentations: [getNodeAutoInstrumentations()],
    })

    sdk.start()
  })()

  try {
    await startPromise
  } catch (error) {
    sdk = null
    startPromise = null
    throw error
  }
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (!sdk) {
    return
  }

  const currentSdk = sdk
  sdk = null
  startPromise = null
  await currentSdk.shutdown()
}
