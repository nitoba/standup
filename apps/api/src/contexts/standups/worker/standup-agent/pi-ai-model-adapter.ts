import { getModel } from '@mariozechner/pi-ai'
import type { KnownProvider, Model } from '@mariozechner/pi-ai'

export interface RegistryModelInfo {
  provider: string
  modelKey: string // format: "provider:modelName", e.g. "google:gemini-2.0-flash"
}

export function toPiAiModel(registryModel: RegistryModelInfo): Model<never> {
  // modelKey format is "provider:modelName" — extract the model name part
  const modelName = registryModel.modelKey.includes(':')
    ? registryModel.modelKey.split(':').slice(1).join(':')
    : registryModel.modelKey

  return getModel(
    registryModel.provider as KnownProvider,
    modelName as never,
  )
}
