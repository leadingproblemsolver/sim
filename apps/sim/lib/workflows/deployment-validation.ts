import { getBlock } from '@/blocks'
import { isTriggerBlockType } from '@/executor/constants'
import { collectBlockFieldIssues, extractBlockParams } from '@/serializer'
import type { BlockState, WorkflowState } from '@/stores/workflows/workflow/types'

export interface DeploymentWorkflowValidationResult {
  valid: boolean
  errors: string[]
}

function blockLabel(blockId: string, block: BlockState): string {
  return `"${block.name || blockId}" (${block.type || 'unknown'})`
}

function isWorkflowEntryBlock(block: BlockState): boolean {
  return block.triggerMode === true || isTriggerBlockType(block.type)
}

/**
 * Validates the draft invariants that must hold before a workflow is admitted
 * into the deployment lifecycle.
 *
 * This intentionally stays synchronous and evidence-based: it checks graph
 * reachability from an entry point and the same required-field semantics used
 * by the runtime serializer. Provider credentials and other live references are
 * resolved later by their existing deployment/runtime boundaries.
 */
export function validateWorkflowForDeployment(
  workflowState: Pick<WorkflowState, 'blocks' | 'edges'>
): DeploymentWorkflowValidationResult {
  const blocks = workflowState.blocks || {}
  const edges = Array.isArray(workflowState.edges) ? workflowState.edges : []
  const errors: string[] = []

  const incomingTargets = new Set<string>()
  for (const edge of edges) {
    if (blocks[edge.source] && blocks[edge.target]) {
      incomingTargets.add(edge.target)
    }
  }

  for (const [blockId, block] of Object.entries(blocks)) {
    if (!block || block.type === 'note') continue

    if (!isWorkflowEntryBlock(block) && !incomingTargets.has(blockId)) {
      errors.push(`Block ${blockLabel(blockId, block)} has no incoming connection`)
    }

    if (block.type === 'loop' || block.type === 'parallel') continue

    const blockConfig = getBlock(block.type)
    if (!blockConfig) continue

    let params: Record<string, any>
    try {
      params = extractBlockParams(block)
    } catch {
      errors.push(`Block ${blockLabel(blockId, block)} could not resolve its configuration`)
      continue
    }

    const { missingRequiredFields } = collectBlockFieldIssues(block, blockConfig, params)
    if (missingRequiredFields.length > 0) {
      errors.push(
        `Block ${blockLabel(blockId, block)} is missing required fields: ${missingRequiredFields.join(', ')}`
      )
    }
  }

  return { valid: errors.length === 0, errors }
}
