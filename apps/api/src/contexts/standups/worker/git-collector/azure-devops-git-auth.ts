export function buildAuthHeader(pat: string): string {
  const basicAuth = Buffer.from(`:${pat}`).toString('base64')
  return `AUTHORIZATION: Basic ${basicAuth}`
}

export function buildCloneUrl(
  org: string,
  project: string,
  name: string,
): string {
  return `https://dev.azure.com/${org}/${project}/_git/${name}`
}
