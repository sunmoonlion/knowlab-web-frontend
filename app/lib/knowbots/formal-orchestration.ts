import { validatedCallers } from '@/contracts/formal-methods'
import type { FormalDefinition, FormalDraft, FormalVersion } from '@/contracts/formal-methods'

// This is only a structural UI gate. The server resolves each exact dependency
// and checks its current host qualification, source, authority and interfaces.
export function supportsOrchestrationExecution(draft: FormalDraft | null): boolean {
  const graph = draft?.definition.procedure
  if (
    !draft ||
    graph?.kind !== 'orchestration' ||
    draft.allowed_callers.length !== 1 ||
    draft.allowed_callers[0] !== 'host' ||
    graph.max_replans !== 0 ||
    graph.max_depth < 2 ||
    graph.steps.length === 0 ||
    graph.max_steps < graph.steps.length ||
    graph.max_expansions < graph.steps.length + 1
  )
    return false
  const steps = new Map(graph.steps.map((step) => [step.id, step]))
  if (steps.size !== graph.steps.length) return false
  const references = new Map<string, string>()
  const visiting = new Set<string>(),
    done = new Set<string>()
  const visit = (id: string): boolean => {
    if (done.has(id)) return true
    const step = steps.get(id)
    if (!step || visiting.has(id)) return false
    visiting.add(id)
    if (!step.depends_on.every(visit)) return false
    visiting.delete(id)
    done.add(id)
    return true
  }
  for (const step of graph.steps) {
    if (
      !step.always_required ||
      step.on_failure !== 'fail' ||
      step.candidates.length !== 1 ||
      new Set(step.depends_on).size !== step.depends_on.length ||
      !visit(step.id)
    )
      return false
    const ref = step.candidates[0]
    const key = `${ref.method_id}:${ref.version}`
    if (references.has(key) && references.get(key) !== ref.digest) return false
    references.set(key, ref.digest)
    for (const { binding } of Object.values(step.inputs)) {
      if (binding.source === 'resource') return false
      if (
        binding.source === 'step' &&
        (!step.depends_on.includes(binding.step) ||
          !Object.hasOwn(steps.get(binding.step)?.outputs ?? {}, binding.output))
      )
        return false
    }
  }
  return (
    Object.keys(graph.exports).length > 0 &&
    Object.values(graph.exports).every((ref) =>
      Object.hasOwn(steps.get(ref.step)?.outputs ?? {}, ref.output),
    )
  )
}

// A workdraft constructed from an author's own registered version still needs
// its own validation and freeze. Only the dependency keeps its frozen identity.
export function expertFromTool(version: FormalVersion): FormalDefinition | null {
  const definition = version.definition
  const { procedure: tool, ...contract } = definition
  if (
    tool.kind !== 'direct' ||
    version.provenance.method_kind !== 'tool' ||
    !(version.provenance.allowed_callers ?? ['host']).includes('host') ||
    (version.provenance.validation &&
      !validatedCallers(version.provenance.validation).includes('host'))
  )
    return null

  return expertFromToolContract(version, {
    ...contract,
    inputs: tool.inputs,
    outputs: tool.outputs,
  })
}

export function expertFromToolContract(
  reference: { method_id: string; version: number; digest: string },
  tool: Omit<FormalDefinition, 'procedure'> &
    Pick<Extract<FormalDefinition['procedure'], { kind: 'direct' }>, 'inputs' | 'outputs'>,
): FormalDefinition {
  const { inputs: slots, outputs: results, ...definition } = tool
  const id = 'step_1'
  const inputs = Object.fromEntries(
    Object.entries(slots).map(([name, slot]) => [
      name,
      { slot, binding: { source: 'caller' as const, name } },
    ]),
  )
  const exports = Object.fromEntries(
    Object.entries(results).map(([output, slot]) => [
      output,
      { step: id, output, always_present: slot.required },
    ]),
  )
  return {
    ...definition,
    procedure: {
      kind: 'orchestration',
      instructions: definition.capability_declaration.purpose,
      steps: [
        {
          id,
          candidates: [
            {
              method_id: reference.method_id,
              version: reference.version,
              digest: reference.digest,
            },
          ],
          depends_on: [],
          select_when: 'always',
          required_when: 'always',
          always_required: true,
          inputs,
          outputs: tool.outputs,
          on_failure: 'fail',
        },
      ],
      exports,
      max_depth: 2,
      max_expansions: 2,
      max_steps: 1,
      max_replans: 0,
    },
  }
}
