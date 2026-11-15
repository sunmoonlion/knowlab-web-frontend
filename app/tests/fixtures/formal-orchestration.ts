import type { FormalDraft } from '@/contracts/formal-methods'

export function orchestrationDraft(base: FormalDraft): FormalDraft {
  if (base.definition.procedure.kind !== 'direct') throw new Error('Expected direct fixture')
  const outputs = structuredClone(base.definition.procedure.outputs)
  const [output, slot] = Object.entries(outputs)[0]
  const textSlot = { ...slot, description: 'Input text', schema: { type: 'string' } }
  const first = {
    id: 'first',
    candidates: [
      {
        method_id: 'f45d7d69-1d43-4f13-9207-81de485e18e1',
        version: 3,
        digest: 'sha256:' + 'b'.repeat(64),
      },
    ],
    select_when: 'Use the pinned dependency',
    required_when: 'Always',
    always_required: true,
    depends_on: [] as string[],
    inputs: {
      message: { slot: textSlot, binding: { source: 'caller' as const, name: 'message' } },
      fixed: { slot: textSlot, binding: { source: 'literal' as const, value: 'fixed input' } },
    },
    outputs,
    on_failure: 'fail' as const,
  }
  return {
    ...structuredClone(base),
    source: null,
    allowed_callers: ['host'],
    definition: {
      ...structuredClone(base.definition),
      procedure: {
        kind: 'orchestration',
        instructions: 'Run both required steps',
        steps: [
          first,
          {
            ...first,
            id: 'second',
            candidates: [
              {
                method_id: 'a45d7d69-1d43-4f13-9207-81de485e18e1',
                version: 4,
                digest: 'sha256:' + 'c'.repeat(64),
              },
            ],
            depends_on: ['first'],
            inputs: { message: { slot, binding: { source: 'step', step: 'first', output } } },
          },
        ],
        exports: { [output]: { step: 'second', output, always_present: true } },
        max_depth: 2,
        max_expansions: 3,
        max_steps: 2,
        max_replans: 0,
      },
    },
  }
}
