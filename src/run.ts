import assert from 'assert'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import { Octokit } from '@octokit/action'
import { Context, getContext, getOctokit } from './github.js'
import { IssueCommentEditedEvent, IssuesEditedEvent, IssuesOpenedEvent } from '@octokit/webhooks-types'

export const run = async (): Promise<void> => {
  const octokit = getOctokit()
  const context = await getContext()
  if ('issue' in context.payload) {
    if ('comment' in context.payload) {
      if (context.payload.action === 'edited') {
        core.info(`Processing #${context.payload.comment.html_url}`)
        await processIssueComment(context.payload, octokit, context)
        return
      }
    }

    if (context.payload.action === 'opened' || context.payload.action === 'edited') {
      core.info(`Processing #${context.payload.issue.number}`)
      await processIssue(context.payload, octokit)
      return
    }
  }
}

const processIssue = async (event: IssuesOpenedEvent | IssuesEditedEvent, octokit: Octokit) => {
  const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 })
  const commentBody = `<!-- int128/actions-tanpopo-bot -->
## :robot: actions-tanpopo-bot
${repositories.map((repo) => `- [ ] ${repo.full_name}`).join('\n')}
`

  const { data: comments } = await octokit.rest.issues.listComments({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    issue_number: event.issue.number,
    per_page: 100,
  })
  const botComment = comments.find((comment) => comment.body?.startsWith('<!-- int128/actions-tanpopo-bot -->'))
  if (botComment) {
    await octokit.issues.updateComment({
      owner: event.repository.owner.login,
      repo: event.repository.name,
      comment_id: botComment.id,
      body: commentBody,
    })
    return
  }
  await octokit.issues.createComment({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    issue_number: event.issue.number,
    body: commentBody,
  })
}

const processIssueComment = async (event: IssueCommentEditedEvent, octokit: Octokit, context: Context) => {
  const repositories = findCheckedRepositories(event.comment.body)

  for (const repository of repositories) {
    core.info(`Processing the repository: ${repository}`)
    await processRepository(repository, octokit, context)
  }

  await octokit.issues.updateComment({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    comment_id: event.comment.id,
    body: event.comment.body.replaceAll('- [x] ', '- [ ] '),
  })
}

export const findCheckedRepositories = (comment: string): string[] => {
  return comment
    .split('\n')
    .filter((line) => line.startsWith('- [x]'))
    .map((line) => line.slice('- [x]'.length).trim())
}

const processRepository = async (repository: string, octokit: Octokit, context: Context) => {
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
