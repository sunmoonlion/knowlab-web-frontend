'use client'

import { z } from 'zod'
import { testExecutionSchema } from '@/contracts/test-execution'
import { requestJson } from '@/lib/common/api-client'
import { parse } from './client'

export async function fetchTestExecution(test: string, caseId?: string) {
  const query = caseId ? `?case_id=${encodeURIComponent(caseId)}` : ''
  const reply = await requestJson(
    `/api/web/v1/knowbot-tests/${encodeURIComponent(test)}/execution${query}`,
  )
  return parse(z.object({ execution: testExecutionSchema }), reply).execution
}
