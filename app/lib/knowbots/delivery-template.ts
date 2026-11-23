import type { FormalDefinition } from '@/contracts/formal-methods'
import type { MethodTemplate } from '@/contracts/workdraft'

/** Bind the confirmed top-level promise to the exports of this particular graph. */
export function withDeliveryTemplate(
  definition: FormalDefinition,
  template: MethodTemplate,
): FormalDefinition {
  const procedure = definition.procedure
  const outputs = Object.keys(procedure.kind === 'direct' ? procedure.outputs : procedure.exports)
  const declaration = definition.capability_declaration
  const conditions = { ...declaration.conditions }
  delete conditions.template_delivery
  const { conditions: previousConditions, ...base } = declaration
  return {
    ...definition,
    capability_declaration: {
      ...base,
      ...(previousConditions && Object.keys(conditions).length ? { conditions } : {}),
      purpose: template.goal,
      promises: { ...declaration.promises, template_delivery: template.deliverable },
    },
    how_to_validate: [
      ...definition.how_to_validate.filter((rule) => rule.promise_id !== 'template_delivery'),
      {
        promise_id: 'template_delivery',
        outputs,
        check: template.check,
        evidence: template.evidence,
        on_failure: 'fail',
      },
    ],
  }
}

/** A one-turn instruction reads the author's text and returns a text deliverable. */
export function instructionFromTemplate(
  template: MethodTemplate,
  title: string,
  source: import('@/contracts/formal-methods').FormalSource,
): FormalDefinition {
  if (
    !['registered_instruction', 'skill_instruction'].includes(source.kind) ||
    source.license_basis === 'pending'
  ) {
    throw new Error('instruction_source_required')
  }
  const slot = (description: string) => ({
    description,
    schema: { type: 'string' },
    required: true,
    meaning: {},
    on_missing: 'fail' as const,
  })
  return withDeliveryTemplate(
    {
      contract: 'knowlab/formal-method/v1',
      capability_declaration: {
        title,
        purpose: template.goal,
        applies_when: [template.goal],
        excludes: [],
        promises: {},
      },
      access_requirements: [],
      what_requires_approval: [],
      how_to_validate: [],
      procedure: {
        kind: 'direct',
        implementation: {
          kind: source.kind,
          source: source.source,
          entry: source.entry,
          version: source.version,
          digest: source.digest,
          requirement_ids: [],
        },
        instructions: [template.goal, template.deliverable, template.check, template.evidence].join(
          '\n',
        ),
        inputs: { input: slot(template.goal) },
        outputs: { result: slot(template.deliverable) },
        stop_conditions: [template.check],
        max_model_turns: 1,
      },
    },
    template,
  )
}
