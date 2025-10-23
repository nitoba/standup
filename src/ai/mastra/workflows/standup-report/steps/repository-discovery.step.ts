import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { logger } from '@/lib/logger'
import {
	detectUserFromGitConfig,
	discoverRepositories,
	userIdentifierSchema,
} from '@/lib/user'

// Step 1: Repository Discovery
export const repositoryDiscoveryStep = createStep({
	id: 'repository-discovery',
	description: 'Discover Git repositories from folder or use single repository',
	inputSchema: z.object({
		repositoriesFolder: z.string().optional(),
		user: userIdentifierSchema.optional(),
	}),
	outputSchema: z.object({
		repositories: z.array(z.string()),
		user: userIdentifierSchema,
	}),
	execute: async ({ inputData }) => {
		let { repositoriesFolder = Bun.env.REPOSITORIES_FOLDER, user } = inputData
		let repositories: string[] = []

		if (!user || Object.keys(user).length === 0) {
			user = {
				gitAuthorEmail: Bun.env.GIT_AUTHOR_EMAIL,
				gitAuthorName: Bun.env.GIT_AUTHOR_NAME,
				azureDevOpsDisplayName: Bun.env.AZURE_DEVOPS_USER_DISPLAY_NAME,
				azureDevOpsEmail: Bun.env.AZURE_DEVOPS_USER_EMAIL,
			}
		}

		if (repositoriesFolder) {
			repositories = await discoverRepositories(repositoriesFolder)
			// logger.info(
			// 	`Discovered ${repositories.length} repositories in ${repositoriesFolder}`
			// )
		} else {
			repositories = [process.cwd()]
			logger.info(`Using current directory: ${process.cwd()}`)
		}

		if (!user) {
			if (repositories.length === 0) {
				throw new Error('No repositories found and no user specified')
			}
			logger.info('No user specified, attempting to detect from git config...')
			user = await detectUserFromGitConfig(repositories[0] as string)
			logger.info(`Detected user: ${user.gitAuthorName || user.gitAuthorEmail}`)
		}

		return {
			repositories,
			user,
		}
	},
})
