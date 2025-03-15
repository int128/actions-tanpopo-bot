import * as core from '@actions/core'
import { getContext, getOctokit } from './github.js'
import { IssuesEditedEvent, IssuesOpenedEvent } from '@octokit/webhooks-types'
import { Octokit } from '@octokit/rest'

export const run = async (): Promise<void> => {
  const octokit = getOctokit()
  const context = await getContext()
  if ('issue' in context.payload) {
    if (context.payload.action === 'opened' || context.payload.action === 'edited') {
      core.info(`Processing #${context.payload.issue.number}`)
      await processIssue(context.payload, octokit)
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
