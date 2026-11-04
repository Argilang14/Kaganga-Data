import { dormEvaluationExcel } from '$lib/server/dorm-evaluation-excel';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => dormEvaluationExcel(event, true, true);
