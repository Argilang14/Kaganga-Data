#!/usr/bin/env node
import { createClient } from '@libsql/client';

const url = process.env.DB_URL || 'file:./data/database.sqlite3';
const client = createClient({ url, authToken: process.env.DB_AUTH_TOKEN });

try {
	const [quick, foreignKeys, tables] = await Promise.all([
		client.execute('PRAGMA quick_check'),
		client.execute('PRAGMA foreign_key_check'),
		client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
		)
	]);
	const quickResult = String(
		quick.rows[0]?.quick_check ?? Object.values(quick.rows[0] ?? {})[0] ?? ''
	);
	const tableNames = new Set(tables.rows.map((row) => String(row.name)));
	const required = ['sekolah', 'auth_user', 'murid', 'kelas'];
	const missingRequired = required.filter((name) => !tableNames.has(name));
	const governance = ['audit_log', 'murid_lifecycle', 'murid_riwayat_kelas'];
	const missingGovernance = governance.filter((name) => !tableNames.has(name));
	const workflow = ['surat_arsip'];
	const missingWorkflow = workflow.filter((name) => !tableNames.has(name));

	console.log(`Database: ${url}`);
	console.log(`Quick check: ${quickResult}`);
	console.log(`Foreign key violations: ${foreignKeys.rows.length}`);
	console.log(`Tables: ${tableNames.size}`);
	console.log(
		`Data governance: ${missingGovernance.length ? `belum lengkap (${missingGovernance.join(', ')})` : 'siap'}`
	);
	console.log(
		`Document workflow: ${missingWorkflow.length ? `belum lengkap (${missingWorkflow.join(', ')})` : 'siap'}`
	);
	const documentManagement = ['document_attachment', 'document_approval'];
	const missingDocumentManagement = documentManagement.filter((name) => !tableNames.has(name));
	console.log(
		`Document management: ${missingDocumentManagement.length ? `belum lengkap (${missingDocumentManagement.join(', ')})` : 'siap'}`
	);
	const operations = ['inventaris', 'inventaris_peminjaman', 'inventaris_perawatan', 'pengumuman'];
	const missingOperations = operations.filter((name) => !tableNames.has(name));
	console.log(
		`Inventaris dan pengumuman: ${missingOperations.length ? `belum lengkap (${missingOperations.join(', ')})` : 'siap'}`
	);
	const productionOperations = [
		'server_identity',
		'maintenance_run',
		'communication_template',
		'communication_queue'
	];
	const missingProductionOperations = productionOperations.filter((name) => !tableNames.has(name));
	console.log(
		`Operasional produksi: ${missingProductionOperations.length ? `belum lengkap (${missingProductionOperations.join(', ')})` : 'siap'}`
	);

	if (quickResult.toLowerCase() !== 'ok' || foreignKeys.rows.length || missingRequired.length) {
		if (missingRequired.length) console.error(`Tabel wajib hilang: ${missingRequired.join(', ')}`);
		process.exitCode = 1;
	}
} finally {
	await client.close();
}
