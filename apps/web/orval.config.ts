import { defineConfig } from 'orval'

export default defineConfig({
  standup: {
    input: {
      target: '../api/openapi.json',
      filters: {
        tags: ['standups', 'settings', 'repos', 'reminders', 'digests'],
      },
    },
    output: {
      mode: 'tags-split',
      target: 'src/app/api/endpoints',
      schemas: 'src/app/api/model',
      client: 'angular-query',
      httpClient: 'angular',
      clean: true,
      prettier: true,
      override: {
        query: {
          useInvalidate: true,
          signal: true,
          mutationInvalidates: [
            {
              onMutations: ['approveStandup', 'updateStandupStatus'],
              invalidates: [
                'listStandups',
                { query: 'getStandupById', params: ['id'] },
              ],
            },
            {
              onMutations: ['triggerStandup'],
              invalidates: ['listStandups'],
            },
            {
              onMutations: ['updateMeSettings'],
              invalidates: ['getMeSettings'],
            },
          ],
        },
      },
    },
  },
})
