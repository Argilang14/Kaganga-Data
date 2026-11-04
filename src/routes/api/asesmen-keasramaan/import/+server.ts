import { dormEvaluationExcel } from '$lib/server/dorm-evaluation-excel';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = (event) => dormEvaluationExcel(event, false, false);
