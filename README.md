# actions-tanpopo-bot [![ts](https://github.com/int128/actions-tanpopo-bot/actions/workflows/ts.yaml/badge.svg)](https://github.com/int128/actions-tanpopo-bot/actions/workflows/ts.yaml)

This is an action of bot to automate routine tasks.

## Getting Started

### Create GitHub App

Create your GitHub App from [this link](https://github.com/settings/apps/new?webhook_active=false&url=https://github.com/int128/actions-tanpopo-bot&contents=write&pull_requests=write&workflows=write).
Here are the required permissions:

- Contents: read and write
- Pull Requests: read and write
- Workflows: read and write

Install the GitHub App to your repositories.

### Create repository and workflow

Create a new repository.
Add the following secrets:

- `BOT_APP_ID` = App ID of the GitHub App
- `BOT_APP_PRIVATE_KEY` = Private key of the GitHub App
- `BOT_APP_INSTALLATION_ID` = Installation ID of the GitHub App

Create a workflow.

TODO
