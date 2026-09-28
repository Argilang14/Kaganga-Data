#!/usr/bin/env node
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5153';
const databaseUrl = process.env.DB_URL;
if (!databaseUrl || !databaseUrl.includes('/tmp/')) throw new Error('QA harus memakai database di folder tmp.');
const uploadRoot = path.resolve(process.env.QA_UPLOAD_ROOT || './tmp/qa-uploads', 'attachments');
const client = createClient({ url: databaseUrl });
const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
const marker = `QA-${Date.now()}`;
let attachmentId = null;
let attachmentPath = null;
let approvalId = null;

async function post(route, formData, cookie) {
	const response = await fetch(`${baseUrl}${route}`, {
		method: 'POST',
		headers: { cookie, origin: baseUrl },
		body: formData,
		redirect: 'manual'
	});
	if (![200, 303].includes(response.status)) throw new Error(`${route} gagal: ${response.status} ${(await response.text()).slice(0, 300)}`);
	return response.status;
}

try {
	const admin = (await client.execute("SELECT id, sekolah_id FROM auth_user WHERE type='admin' ORDER BY id LIMIT 1")).rows[0];
	const schoolId = admin?.sekolah_id ?? (await client.execute('SELECT id FROM sekolah ORDER BY id LIMIT 1')).rows[0]?.id;
	if (!admin || !schoolId) throw new Error('Data admin/sekolah QA tidak tersedia.');
	const now = new Date().toISOString();
	await client.execute({ sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', args: [admin.id, tokenHash, 'Codex document QA', '127.0.0.1', new Date(Date.now() + 600_000).toISOString(), now, now] });
	const cookie = `rapkumer-session=${token}; active-sekolah-id=${schoolId}`;

	const upload = new FormData();
	upload.set('entityType', 'sekolah');
	upload.set('entityId', String(schoolId));
	upload.set('category', marker);
	upload.set('file', new File([Buffer.from('%PDF-1.7\nQA Kaganga\n%%EOF')], 'qa-document.pdf', { type: 'application/pdf' }));
	console.log(`UPLOAD_HTTP=${await post('/berkas?/upload', upload, cookie)}`);
	const attachment = (await client.execute({ sql: 'SELECT id,stored_path FROM document_attachment WHERE category=? ORDER BY id DESC LIMIT 1', args: [marker] })).rows[0];
	if (!attachment) throw new Error('Metadata attachment tidak tersimpan.');
	attachmentId = Number(attachment.id);
	attachmentPath = String(attachment.stored_path);
	const download = await fetch(`${baseUrl}/api/berkas/${attachmentId}`, { headers: { cookie }, redirect: 'manual' });
	if (download.status !== 200 || !Buffer.from(await download.arrayBuffer()).subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Unduhan attachment QA tidak valid.');
	console.log('DOWNLOAD_HTTP=200 SIGNATURE=PDF');
	const remove = new FormData(); remove.set('id', String(attachmentId));
	console.log(`DELETE_HTTP=${await post('/berkas?/delete', remove, cookie)}`);
	const attachmentCount = (await client.execute({ sql: 'SELECT count(*) total FROM document_attachment WHERE id=?', args: [attachmentId] })).rows[0].total;
	if (Number(attachmentCount) !== 0) throw new Error('Metadata attachment belum terhapus.');
	attachmentId = null;

	const create = new FormData(); create.set('documentType', 'jadwal_pelajaran'); create.set('title', marker); create.set('note', 'QA alur lengkap');
	console.log(`APPROVAL_CREATE_HTTP=${await post('/persetujuan?/create', create, cookie)}`);
	const approval = (await client.execute({ sql: 'SELECT id FROM document_approval WHERE title_snapshot=? ORDER BY id DESC LIMIT 1', args: [marker] })).rows[0];
	if (!approval) throw new Error('Draft persetujuan tidak tersimpan.');
	approvalId = Number(approval.id);
	for (const target of ['diajukan', 'diperiksa', 'disetujui', 'diterbitkan']) {
		const transition = new FormData(); transition.set('id', String(approvalId)); transition.set('target', target); transition.set('note', `QA ${target}`);
		console.log(`APPROVAL_${target.toUpperCase()}_HTTP=${await post('/persetujuan?/transition', transition, cookie)}`);
	}
	const final = (await client.execute({ sql: 'SELECT status,snapshot_json,published_at FROM document_approval WHERE id=?', args: [approvalId] })).rows[0];
	if (final.status !== 'diterbitkan' || !final.snapshot_json || !final.published_at) throw new Error('Alur persetujuan QA belum lengkap.');
	console.log('APPROVAL_FINAL=diterbitkan SNAPSHOT=ready');
} finally {
	if (attachmentId) await client.execute({ sql: 'DELETE FROM document_attachment WHERE id=?', args: [attachmentId] }).catch(() => undefined);
	if (attachmentPath) await fs.unlink(path.resolve(uploadRoot, ...attachmentPath.split('/'))).catch(() => undefined);
	if (approvalId) await client.execute({ sql: 'DELETE FROM document_approval WHERE id=?', args: [approvalId] }).catch(() => undefined);
	await client.execute({ sql: 'DELETE FROM audit_log WHERE summary LIKE ?', args: [`%${marker}%`] }).catch(() => undefined);
	await client.execute({ sql: 'DELETE FROM auth_session WHERE token_hash=?', args: [tokenHash] }).catch(() => undefined);
	await client.close();
	console.log('QA_DATA_REMOVED');
}
