import * as core from '@actions/core'
import * as github from '@actions/github'
import {ApiClient} from './api-client'
import {Context} from '@actions/github/lib/context'
import type {IssueCommentEvent} from '@octokit/webhooks-types'

function filterDuplicateCommandEvent(
  context: Context
): IssueCommentEvent | null {
  if (context.eventName !== 'issue_comment') {
    throw new Error('This action must be used with `issue_comment` event.')
  }

  const event = context.payload as IssueCommentEvent
  if (!['created', 'edited'].includes(event.action)) {
    throw new Error(
      'This action must be used with `created` or `edited` activity type.'
    )
  }

  return event
}

async function duplicateIssueWithProjectFields(
  apiClient: ApiClient,
  repos: string[],
  event: IssueCommentEvent
): Promise<void> {
  for (const repo of repos) {
    core.info(`Original issue: ${event.issue.html_url}`)
    const newIssue = await apiClient.duplicateIssue(event.issue, event.repository.owner.login, repo)
    core.info(`Issue created: ${newIssue.url}`)
    core.debug('newIssue:')
    core.debug(JSON.stringify(newIssue, null, 2))
    
    const projects = await apiClient.getProjectFieldValues(event.issue.node_id)
    for (const project of projects) {
      const itemId = await apiClient.addIssueToProject(newIssue.id, project.id)
      core.info(`Added issue to project: ${project.url}`)
      core.debug(`itemId: ${itemId}`)
  
      for (const field of project.fields) {
        await apiClient.setProjectFieldValue(project.id, itemId, field)
        core.info(`- Set field value: ${field.name}`)
      }
    }
  
    await apiClient.updateIssueComment(
      event.comment.node_id,
      `${event.comment.body.trim()} 👉 ${newIssue.url}`
    )
  }
  

  core.info('Successfully duplicated.')
}

async function run(): Promise<void> {
  try {
    core.debug('github.context:')
    core.debug(JSON.stringify(github.context, null, 2))

    const event = filterDuplicateCommandEvent(github.context)
    if (!event) return

    const apiClient = new ApiClient(core.getInput('githubToken'))
    const repos = core.getInput('targetRepositories', {required: true}).split(',')
    
    await duplicateIssueWithProjectFields(apiClient, repos, event)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
