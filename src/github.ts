import { Octokit } from '@octokit/rest'
import { createAppAuth, StrategyOptions } from '@octokit/auth-app'

export const getOctokit = (auth: StrategyOptions) =>
  new Octokit({
    authStrategy: createAppAuth,
    auth,
  })
