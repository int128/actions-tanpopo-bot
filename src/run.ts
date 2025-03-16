import assert from 'assert'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import { Octokit } from '@octokit/action'
import { Context, getContext, getOctokit } from './github.js'
import { PullRequestEvent } from '@octokit/webhooks-types'

export const run = async (): Promise<void> => {
  const octokit = getOctokit()
  const context = await getContext()
  if ('pull_request' in context.payload && 'number' in context.payload) {
    core.info(`Processing #${context.payload.number}`)
    await processPullRequest(context.payload, octokit)
    return
  }
}

const processPullRequest = async (event: PullRequestEvent, octokit: Octokit) => {
  const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 })
  const content = `
## :robot: actions-tanpopo-bot
${repositories.map((repo) => `- [ ] ${repo.full_name}`).join('\n')}
`

  const currentBody =
    event.pull_request.body ??
    (await (async () => {
      const { data: pull } = await octokit.rest.pulls.get({
        owner: event.repository.owner.login,
        repo: event.repository.name,
        pull_number: event.pull_request.number,
      })
      core.info(`Fetched the body of ${pull.html_url}`)
      return pull.body || ''
    })())

  const marker = '<!-- int128/actions-tanpopo-bot -->'
  const newBody = insertContentIntoBody(currentBody, content, marker)
  if (newBody === currentBody) {
    core.info(`The pull request body is already desired state`)
    return
  }
  await octokit.pulls.update({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    pull_number: event.pull_request.number,
    body: newBody,
  })
}

export const insertContentIntoBody = (body: string, content: string, marker: string): string => {
  // Typically marker is a comment, so wrap with new lines to prevent corruption of markdown
  marker = `\n${marker}\n`

  const elements = body.split(marker)
  if (elements.length === 1) {
    const firstBlock = elements[0]
    return [firstBlock, marker, content, marker].join('')
  }
  if (elements.length > 2) {
    const firstBlock = elements[0]
    elements.shift()
    elements.shift()
    return [firstBlock, marker, content, marker, ...elements].join('')
  }
  return body
}

export const findCheckedRepositories = (comment: string): string[] => {
  return comment
    .split('\n')
    .filter((line) => line.startsWith('- [x]'))
    .map((line) => line.slice('- [x]'.length).trim())
}

export const processRepository = async (repository: string, octokit: Octokit, context: Context) => {
  const workspace = await fs.mkdtemp('actions-tanpopo-bot-')
  process.chdir(workspace)

  const credentials = Buffer.from(`x-access-token:${core.getInput('token')}`).toString('base64')
  core.setSecret(credentials)
  await exec.exec('git', [
    'clone',
    '-c',
    `http.https://github.com/.extraheader=AUTHORIZATION: basic ${credentials}`,
    '--depth=1',
    `${context.serverUrl}/${repository}.git`,
  ])

  await exec.exec('git', ['config', 'user.name', context.actor])
  await exec.exec('git', ['config', 'user.email', `${context.actor}@users.noreply.github.com`])

  assert(octokit)
}
