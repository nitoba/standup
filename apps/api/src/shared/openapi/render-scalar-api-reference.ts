import { getHtmlDocument } from '@scalar/core/libs/html-rendering'
import { customThemeCSS } from '@scalar/nestjs-api-reference'
import { OPENAPI_JSON_PATH } from './openapi.constants'

export function renderScalarApiReference(): string {
  return getHtmlDocument(
    {
      _integration: 'nestjs',
      pageTitle: 'Standup API Reference',
      title: 'Standup API',
      url: OPENAPI_JSON_PATH,
      theme: 'alternate',
      layout: 'modern',
      darkMode: false,
      documentDownloadType: 'json',
    },
    customThemeCSS,
  )
}
