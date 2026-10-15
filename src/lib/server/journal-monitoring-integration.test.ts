import assert from 'node:assert/strict';
import test from 'node:test';
import {
	monitoringJournalSubmissionMatches,
	normalizeMonitoringJournalContext,
	type MonitoringJournalContext
} from './journal-monitoring-integration.ts';

const context: MonitoringJournalContext = {
	monitoringKey: 'meeting-key',
	tanggal: '2026-10-13',
	jenisJadwal: 'ganjil',
	kelasId: 12,
	kelasNama: 'VII A',
	jadwalMapelId: 8,
	mataPelajaranId: 18,
	mapelNama: 'Matematika',
	mapelKode: 'MTK',
	jadwalIds: [102, 101],
	jamPelajaran: '2-3',
	pukul: '08:00-09:20',
	jadwalTemplateId: 4,
	tahunAjaranId: 2,
	semesterId: 3,
	existingJournalId: null,
	source: 'schedule'
};

test('normalizes monitoring schedule ids', () => {
	assert.deepEqual(normalizeMonitoringJournalContext(context).jadwalIds, [101, 102]);
});

test('requires an exact monitoring submission match', () => {
	const normalized = normalizeMonitoringJournalContext(context);
	const submission = {
		monitoringKey: 'meeting-key',
		tanggal: '2026-10-13',
		jenisJadwal: 'ganjil',
		kelasId: 12,
		jadwalMapelId: 8,
		mataPelajaranId: 18,
		jadwalIds: [102, 101]
	};
	assert.equal(monitoringJournalSubmissionMatches(normalized, submission), true);
	assert.equal(
		monitoringJournalSubmissionMatches(normalized, { ...submission, kelasId: 13 }),
		false
	);
	assert.equal(
		monitoringJournalSubmissionMatches(normalized, { ...submission, jadwalIds: [101] }),
		false
	);
});
