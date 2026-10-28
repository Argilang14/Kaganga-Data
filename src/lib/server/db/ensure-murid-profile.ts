import { ensureSchema } from './ensure-helper';
import { muridProfileSchemaStatements } from './murid-profile-schema';

export async function ensureMuridProfileSchema() {
	await ensureSchema('murid-profile-v1', muridProfileSchemaStatements);
}
