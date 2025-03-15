import assert from 'assert'
import * as core from '@actions/core'
import { getOctokit } from './github.js'

type Inputs = {
  appId: string
  appPrivateKey: string
  appInstallationId: string
  dryRun: boolean
}

export const run = async (inputs: Inputs): Promise<void> => {
  const octokit = getOctokit({
    type: 'installation',
    appId: inputs.appId,
    privateKey: inputs.appPrivateKey,
    installationId: inputs.appInstallationId,
  })
  const { data: authenticated } = await octokit.rest.apps.getAuthenticated()
  assert(authenticated)
  core.info(`Authenticated as ${authenticated.name}`)
  const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 })
  for (const repository of repositories) {
    core.info(`Processing the repository ${repository.owner.login}`)
  }
}
