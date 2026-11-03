import { methodView, type MethodVersion } from '@/contracts/author-methods'
import type { IdeaIn } from '@/contracts/knowbots'

/** Text seed for the author's idea, never an execution binding. */
export function composeIdeaTemplate(
  original: IdeaIn,
  methods: MethodVersion[],
  label: (key: string) => string,
  checkLabel: (key: string) => string,
): string {
  const existing =
    original.kind === 'skill'
      ? original.skill
      : original.kind === 'question'
        ? original.question
        : Object.entries(original.answers)
            .filter(([, value]) => value.trim())
            .map(([key, value]) => `${label(key)}:\n${value}`)
            .join('\n\n')
  const blocks = methods.map((method, index) => {
    const view = methodView(method.definition)
    return [
      `## ${index + 1}. ${view.step.title}`,
      view.step.why,
      view.step.does,
      `${label('applies_when')}: ${view.step.selection?.applies_when ?? ''}`,
      `${label('inputs')}:\n${JSON.stringify(view.input_schemas, null, 2)}`,
      `${label('outputs')}:\n${view.step.outputs.map((o) => `${o.name}${o.items?.length ? ` (${o.items.map((f) => f.name).join(', ')})` : ''}`).join('\n')}`,
      `${label('rules')}:\n${view.step.rules.map((r) => r.text).join('\n')}`,
      `${label('correctness')}:\n${view.step.checks.map((c) => `${checkLabel(c.template)}: ${JSON.stringify(c.params)}${c.when_input_present ? ` (${label('when_input_present')}: ${c.when_input_present})` : ''}`).join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n')
  })
  const text = [existing, ...blocks].filter(Boolean).join('\n\n')
  if (text.length > 20000) throw new Error('idea_template_too_large')
  return text
}
