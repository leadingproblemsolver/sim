/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { validateWorkflowForDeployment } from '@/lib/workflows/deployment-validation'
import type { WorkflowState } from '@/stores/workflows/workflow/types'

function block(
  id: string,
  type: string,
  options: {
    name?: string
    enabled?: boolean
    triggerMode?: boolean
    subBlocks?: Record<string, any>
  } = {}
) {
  return {
    id,
    type,
    name: options.name ?? id,
    position: { x: 0, y: 0 },
    enabled: options.enabled ?? true,
    triggerMode: options.triggerMode,
    subBlocks: options.subBlocks ?? {},
    outputs: {},
  }
}

function state(blocks: Record<string, any>, edges: any[] = []): WorkflowState {
  return {
    blocks,
    edges,
    loops: {},
    parallels: {},
    variables: {},
    lastSaved: 0,
  } as WorkflowState
}

describe('validateWorkflowForDeployment', () => {
  it('accepts a connected workflow with no required-field failures', () => {
    const workflow = state(
      {
        start: block('start', 'starter', { name: 'Start' }),
        fn: block('fn', 'function', { name: 'Function' }),
      },
      [{ id: 'edge-1', source: 'start', target: 'fn' }]
    )

    expect(validateWorkflowForDeployment(workflow)).toEqual({ valid: true, errors: [] })
  })

  it('rejects a disconnected non-entry block before deployment', () => {
    const workflow = state({
      start: block('start', 'starter', { name: 'Start' }),
      fn: block('fn', 'function', { name: 'Disconnected Function' }),
    })

    const result = validateWorkflowForDeployment(workflow)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      'Block "Disconnected Function" (function) has no incoming connection'
    )
  })

  it('rejects a connected block with missing required configuration', () => {
    const workflow = state(
      {
        start: block('start', 'starter', { name: 'Start' }),
        neo4j: block('neo4j', 'neo4j', {
          name: 'Neo4j',
          subBlocks: {
            operation: { id: 'operation', type: 'dropdown', value: 'query' },
          },
        }),
      },
      [{ id: 'edge-1', source: 'start', target: 'neo4j' }]
    )

    const result = validateWorkflowForDeployment(workflow)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('is missing required fields'))).toBe(true)
  })

  it('does not block deployment on required fields inside a disabled block', () => {
    const workflow = state(
      {
        start: block('start', 'starter', { name: 'Start' }),
        neo4j: block('neo4j', 'neo4j', {
          name: 'Disabled Neo4j',
          enabled: false,
          subBlocks: {
            operation: { id: 'operation', type: 'dropdown', value: 'query' },
          },
        }),
      },
      [{ id: 'edge-1', source: 'start', target: 'neo4j' }]
    )

    expect(validateWorkflowForDeployment(workflow)).toEqual({ valid: true, errors: [] })
  })
})
