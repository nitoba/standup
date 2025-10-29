import { discoverRepositories, type UserIdentifier } from '@/ai/lib/user'

type Input = {
	repositoriesFolder?: string
	user?: UserIdentifier
}

export async function discoverRepositoriesStep(data: Input) {
	let { repositoriesFolder = Bun.env.REPOSITORIES_FOLDER, user } = data

	let repositories: string[] = []

	if (!user || Object.keys(user).length === 0) {
		user = {
			gitAuthorEmail: Bun.env.GIT_AUTHOR_EMAIL,
			gitAuthorName: Bun.env.GIT_AUTHOR_NAME,
			azureDevOpsEmail: Bun.env.AZURE_DEVOPS_USER_EMAIL,
		}
	}

	repositories = repositoriesFolder
		? await discoverRepositories(repositoriesFolder)
		: [process.cwd()]

	return {
		repositories,
		user,
	}
}
