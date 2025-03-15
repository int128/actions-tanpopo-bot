import assert from 'assert'
import * as core from '@actions/core'
import { Octokit } from '@octokit/rest'
import { getOctokit } from './github.js'

type Inputs = {
  appId: string
  appPrivateKey: string
  dryRun: boolean
}

export const run = async (inputs: Inputs): Promise<void> => {
  const octokit = getOctokit({
    type: 'app',
    appId: inputs.appId,
    privateKey: inputs.appPrivateKey,
  })
  const { data: authenticated } = await octokit.rest.apps.getAuthenticated()
  assert(authenticated)
  core.info(`Authenticated as ${authenticated.name}`)
  core.summary.addHeading('actions-tanpopo-bot summary', 2)
  await processInstallations(inputs, octokit)
}

const processInstallations = async (inputs: Inputs, octokit: Octokit) => {
  const installations = await octokit.paginate(octokit.apps.listInstallations, { per_page: 100 })
  for (const installation of installations) {
    core.info(`Processing the installation ${installation.id}`)
    await processInstallation(inputs, installation.id)
  }
}

const processInstallation = async (inputs: Inputs, installationId: number) => {
  const octokit = getOctokit({
    type: 'installation',
    appId: inputs.appId,
    privateKey: inputs.appPrivateKey,
    installationId,
  })
  const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 })
  for (const repository of repositories) {
    core.info(`Processing the repository ${repository.owner.login}`)
  }
}
