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
    !!graph.object_batch ||
    graph.steps.some((s) => !!s.candidate_choice) ||
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

// P5 may place a frozen expert in a candidate slot through its public interface.
export function candidateFromVersion(version: FormalVersion): FormalDefinition | null {
  if (version.definition.procedure.kind === 'direct') return expertFromTool(version)
  const { provenance } = version
  if (
    provenance.dispatch !== 'orchestration' ||
    !provenance.validation ||
    !validatedCallers(provenance.validation).includes('host') ||
    !(provenance.allowed_callers ?? ['host']).includes('host')
  )
    return null
  const { inputs, outputs } = provenance.interfaces
  return expertFromToolContract(version, {
    ...version.definition,
    inputs: Object.fromEntries(
      Object.entries(inputs).map(([k, i]) => [
        k,
        { ...i.slot, required: i.required_by.length > 0 },
      ]),
    ),
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([k, o]) => [k, { ...o.slot, required: o.always_present }]),
    ),
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
    const existing = requirements.find((r) =>
      same(r, { ...need, requirement_id: r.requirement_id }),
    )
    let key = existing?.requirement_id ?? need.requirement_id
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

// Only ancestors already ordered before the target can supply an existing artifact.
export function reachableOutputs(graph: Graph, step: Graph['steps'][number], slot: Slot) {
  const nodes = new Map(graph.steps.map((node) => [node.id, node]))
  const ancestors = new Set<string>()
  const pending = [...step.depends_on]
  while (pending.length) {
    const id = pending.pop()!
    if (id === step.id || ancestors.has(id)) continue
    ancestors.add(id)
    pending.push(...(nodes.get(id)?.depends_on ?? []))
  }
  return graph.steps
    .filter((s) => ancestors.has(s.id))
    .flatMap((s) =>
      Object.entries(s.outputs)
        .filter(([, out]) => satisfies(out, slot) && (!slot.required || s.always_required))
        .map(([output]) => ({ source: 'step' as const, step: s.id, output })),
    )
}

export function bindStepInput(
  graph: Graph,
  target: string,
  input: string,
  binding: Graph['steps'][number]['inputs'][string]['binding'],
): Graph {
  return {
    ...graph,
    steps: graph.steps.map((step) =>
      step.id === target
        ? {
            ...step,
            depends_on:
              binding.source === 'step'
                ? [...new Set([...step.depends_on, binding.step])]
                : step.depends_on,
            inputs: { ...step.inputs, [input]: { ...step.inputs[input], binding } },
          }
        : step,
    ),
  }
}

export function prependTool(
  draft: FormalDefinition,
  targetId: string,
  input: string,
  upstream: FormalDefinition,
  output: string,
  topology: 'chain' | 'branch',
) {
  const graph = draft.procedure,
    source = upstream.procedure
  if (
    graph.kind !== 'orchestration' ||
    source.kind !== 'orchestration' ||
    source.steps.length !== 1
  )
    return null
  const target = graph.steps.find((s) => s.id === targetId)
  const entry = target?.inputs[input],
    provider = source.steps[0],
    provided = provider.outputs[output]
  if (
    !target?.always_required ||
    target.candidates.length !== 1 ||
    entry?.binding.source !== 'caller' ||
    !provided ||
    !satisfies(provided, entry.slot)
  )
    return null
  const ids = new Set(graph.steps.map((s) => s.id))
  const prefix = topology === 'branch' ? 'branch' : 'prepare'
  let id = prefix
  for (let n = 1; ids.has(id); n++) id = prefix + '_' + n
  const aliases = new Map<string, Slot>()
  for (const step of graph.steps)
    for (const [name, original] of Object.entries(step.inputs)) {
      if ((step.id !== targetId || name !== input) && original.binding.source === 'caller')
        aliases.set(original.binding.name, original.slot)
    }
  const inputs = structuredClone(provider.inputs)
  const deps = new Set<string>()
  for (const value of Object.values(inputs)) {
    if (value.binding.source !== 'caller') return null
    const available = topology === 'chain' ? reachableOutputs(graph, target, value.slot) : []
    if (available.length === 1) {
      value.binding = available[0]
      deps.add(available[0].step)
      continue
    }
    let key =
      topology === 'branch' ? (id + '_' + value.binding.name).slice(0, 64) : value.binding.name
    for (
      let n = 1;
      aliases.has(key) && (topology === 'branch' || !same(aliases.get(key), value.slot));
      n++
    )
      key = prefix + '_input_' + n
    value.binding.name = key
    aliases.set(key, value.slot)
  }
  const updated = bindStepInput(graph, targetId, input, { source: 'step', step: id, output })
  const steps = updated.steps.flatMap((s) =>
    s.id === targetId ? [{ ...provider, id, inputs, depends_on: [...deps] }, s] : [s],
  )
  const result = formalDefinitionSchema.safeParse({
    ...draft,
    ...combinedRequirements(draft, upstream),
    procedure: {
      ...updated,
      steps,
      max_steps: Math.max(graph.max_steps, steps.length),
      max_expansions: Math.max(graph.max_expansions, steps.length + 1),
    },
  })
  return result.success ? result.data : null
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
  targetId?: string,
):
  | { plan: FormalDefinition }
  | { issue: 'p1NeedsCaller'; slot: string }
  | { issue: 'p1OutputGap' | 'p1BindingGap' | 'p1SameTool' | 'versionUnavailable'; slot: string } {
  const graph = draft.procedure,
    other = candidate.procedure
  if (graph.kind !== 'orchestration' || other.kind !== 'orchestration' || other.steps.length !== 1)
    return { issue: 'versionUnavailable', slot: '' }
  const original = targetId ? graph.steps.find((s) => s.id === targetId) : graph.steps[0],
    replacement = other.steps[0],
    anchor = delivery.startsWith('@')
      ? { step: targetId, output: delivery.slice(1) }
      : graph.exports[delivery]
  if (
    !original?.always_required ||
    original.inputs[gap]?.binding.source !== 'caller' ||
    !anchor ||
    anchor.step !== original.id ||
    original.candidates.length !== 1 ||
    replacement.candidates.length !== 1
  )
    return { issue: 'versionUnavailable', slot: '' }
  if (same(original.candidates[0], replacement.candidates[0]))
    return { issue: 'p1SameTool', slot: '' }
  const exports = { ...graph.exports }
  const outputs: typeof original.outputs = {}
  const used = new Set<string>([anchor.output])
  for (const ref of Object.values(exports)) if (ref.step === original.id) used.add(ref.output)
  for (const step of graph.steps)
    for (const { binding } of Object.values(step.inputs))
      if (binding.source === 'step' && binding.step === original.id) used.add(binding.output)
  for (const oldPort of used) {
    const port = oldPort === anchor.output ? output : oldPort
    const before = original.outputs[oldPort],
      after = replacement.outputs[port]
    if (!before || !after || !satisfies(after, before) || Object.hasOwn(outputs, port))
      return {
        issue: 'p1OutputGap',
        slot:
          Object.keys(exports).find(
            (name) => exports[name].step === original.id && exports[name].output === oldPort,
          ) ?? oldPort,
      }
    outputs[port] = before
  }
  for (const [name, ref] of Object.entries(exports))
    if (ref.step === original.id && ref.output === anchor.output) exports[name] = { ...ref, output }
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
    const accessible = reachableOutputs(graph, original, slot)
    if (accessible.length === 1) {
      inputs[name] = { slot, binding: accessible[0] }
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
      [...graph.steps.flatMap((s) => Object.values(s.inputs)), ...Object.values(inputs)].some(
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
      steps: graph.steps.map((s) => {
        if (s.id === original.id)
          return {
            ...original,
            candidates: replacement.candidates,
            inputs,
            outputs,
            depends_on: [
              ...new Set([
                ...original.depends_on,
                ...Object.values(inputs).flatMap((i) =>
                  i.binding.source === 'step' ? [i.binding.step] : [],
                ),
              ]),
            ],
          }
        if (anchor.output === output) return s
        return {
          ...s,
          inputs: Object.fromEntries(
            Object.entries(s.inputs).map(([name, entry]) => {
              const b = entry.binding
              return [
                name,
                b.source === 'step' && b.step === original.id && b.output === anchor.output
                  ? { ...entry, binding: { ...b, output } }
                  : entry,
              ]
            }),
          ),
        }
      }),
    },
  })
  return result.success ? { plan: result.data } : { issue: 'versionUnavailable', slot: '' }
}
