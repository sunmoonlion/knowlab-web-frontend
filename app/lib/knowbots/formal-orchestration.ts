import type { FormalDraft } from '@/contracts/formal-methods'

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
