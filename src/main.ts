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
  if (event.action !== 'created') {
    throw new Error('This action must be used with `created` activity type.')
  }

  return event.comment.body.trim() === '/duplicate' ? event : null
}

async function duplicateIssueWithProjectFields(
  apiClient: ApiClient,
  event: IssueCommentEvent
): Promise<void> {
  const newIssue = await apiClient.duplicateIssue(event.issue, event.repository)
  core.info(`Issue created: ${newIssue.url}`)
  core.debug('newIssue:')
  core.debug(JSON.stringify(newIssue, null, 2))

  const projects = await apiClient.getProjectFieldValues(event.issue.node_id)
  for (const project of projects) {
    const itemId = await apiClient.addIssueToProject(
      newIssue.node_id,
      project.id
    )
    core.info(`Added issue to project: ${project.url}`)
    core.debug(`itemId: ${itemId}`)

    for (const field of project.fields) {
      await apiClient.setProjectFieldValue(project.id, itemId, field)
      core.info(`- Set field value: ${field.name}`)
    }
  }
  core.info('Successfully duplicated.')
}

async function run(): Promise<void> {
  try {
    core.debug('github.context:')
    core.debug(JSON.stringify(github.context, null, 2))

    const event = filterDuplicateCommandEvent(github.context)
    if (!event) return

    const apiClient = new ApiClient(core.getInput('github-token'))
    await duplicateIssueWithProjectFields(apiClient, event)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
