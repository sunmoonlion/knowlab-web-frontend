import { same } from './workdraft'
import {
  formalCallerBindingSchema,
  formalDefinitionSchema,
  validatedCallers,
} from '@/contracts/formal-methods'
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

export function combinedRequirements(draft: FormalDefinition, candidate: FormalDefinition) {
  const requirements = [...draft.access_requirements]
  const approvals = [...draft.what_requires_approval]
  for (const need of candidate.access_requirements) {
    const existing = requirements.find((r) => same(r, need))
    let key = need.requirement_id
    if (!existing) {
      let n = 0
      while (requirements.some((r) => r.requirement_id === key)) key = 'prepare_access_' + ++n
      requirements.push({ ...need, requirement_id: key })
    }
    for (const rule of candidate.what_requires_approval.filter(
      (r) => r.requirement_id === need.requirement_id,
    )) {
      const item = { ...rule, requirement_id: key }
      if (!approvals.some((r) => same(r, item))) approvals.push(item)
    }
  }
  return { access_requirements: requirements, what_requires_approval: approvals }
}

type Graph = Extract<FormalDefinition['procedure'], { kind: 'orchestration' }>
type Slot = Graph['steps'][number]['outputs'][string]

function satisfies(provided: Slot, required: Slot) {
  return (
    same(provided.schema, required.schema) &&
    same(provided.meaning, required.meaning) &&
    (!required.required || provided.required)
  )
}

// A replacement keeps the expert's public exports, promises, checks and bounds.
// Only bindings backed by the author's remaining inputs can satisfy the new leaf.
export function replaceP1Tool(
  draft: FormalDefinition,
  gap: string,
  delivery: string,
  candidate: FormalDefinition,
  output: string,
  aliases: Record<string, string> = {},
):
  | { plan: FormalDefinition }
  | { issue: 'p1NeedsCaller'; slot: string }
  | { issue: 'p1OutputGap' | 'p1BindingGap' | 'p1SameTool' | 'versionUnavailable'; slot: string } {
  const graph = draft.procedure,
    other = candidate.procedure
  if (
    graph.kind !== 'orchestration' ||
    other.kind !== 'orchestration' ||
    graph.steps.length !== 1 ||
    other.steps.length !== 1
  )
    return { issue: 'versionUnavailable', slot: '' }
  const original = graph.steps[0],
    replacement = other.steps[0],
    anchor = graph.exports[delivery]
  if (
    !original.inputs[gap] ||
    !anchor ||
    original.candidates.length !== 1 ||
    replacement.candidates.length !== 1
  )
    return { issue: 'versionUnavailable', slot: '' }
  if (same(original.candidates[0], replacement.candidates[0]))
    return { issue: 'p1SameTool', slot: '' }
  const exports = { ...graph.exports }
  const outputs: typeof original.outputs = {}
  const mapped = new Map<string, string>()
  for (const [name, ref] of Object.entries(graph.exports)) {
    const port = ref.output === anchor.output ? output : ref.output
    const before = original.outputs[ref.output],
      after = Object.hasOwn(replacement.outputs, port) ? replacement.outputs[port] : undefined
    if (
      ref.step !== original.id ||
      !before ||
      !after ||
      !satisfies(after, before) ||
      (mapped.has(port) && mapped.get(port) !== ref.output)
    )
      return { issue: 'p1OutputGap', slot: name }
    mapped.set(port, ref.output)
    outputs[port] = before
    exports[name] = { ...ref, output: port }
  }
  const inputs: typeof original.inputs = {}
  const missing = original.inputs[gap].binding
  for (const [name, { slot }] of Object.entries(replacement.inputs)) {
    const previous = Object.hasOwn(original.inputs, name) ? original.inputs[name] : undefined
    const unavailable =
      name === gap ||
      (previous?.binding.source === 'caller' &&
        missing.source === 'caller' &&
        previous.binding.name === missing.name)
    if (previous && !unavailable && satisfies(previous.slot, slot)) {
      inputs[name] = previous
      continue
    }
    if (!slot.required) continue
    const missingSlot = original.inputs[gap].slot
    if (same(slot.meaning, missingSlot.meaning) && same(slot.schema, missingSlot.schema))
      return { issue: 'p1BindingGap', slot: name }
    const binding = formalCallerBindingSchema.safeParse({ source: 'caller', name: aliases[name] })
    if (!binding.success || (missing.source === 'caller' && binding.data.name === missing.name))
      return { issue: 'p1NeedsCaller', slot: name }
    const alias = binding.data.name
    if (
      [...Object.values(original.inputs), ...Object.values(inputs)].some(
        (item) =>
          item.binding.source === 'caller' && item.binding.name === alias && !same(item.slot, slot),
      )
    )
      return { issue: 'p1NeedsCaller', slot: name }
    inputs[name] = { slot, binding: binding.data }
  }
  for (const [name, entry] of Object.entries(original.inputs)) {
    if (entry.binding.source !== 'caller' && !same(inputs[name]?.binding ?? null, entry.binding))
      return { issue: 'p1BindingGap', slot: name }
  }
  const result = formalDefinitionSchema.safeParse({
    ...draft,
    ...combinedRequirements(draft, candidate),
    procedure: {
      ...graph,
      exports,
      steps: [{ ...original, candidates: replacement.candidates, inputs, outputs }],
    },
  })
  return result.success ? { plan: result.data } : { issue: 'versionUnavailable', slot: '' }
}
