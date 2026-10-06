import { ensureSchema } from './ensure-helper';

export async function ensureDocumentManagementSchema() {
	await ensureSchema('document-management-v1', [
		`CREATE TABLE IF NOT EXISTS document_attachment (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			entity_type TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			entity_label_snapshot TEXT NOT NULL,
			category TEXT NOT NULL,
			original_name TEXT NOT NULL,
			stored_path TEXT NOT NULL UNIQUE,
			mime_type TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			sha256 TEXT NOT NULL,
			uploaded_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS document_attachment_school_entity_idx ON document_attachment(sekolah_id, entity_type, entity_id)`,
		`CREATE INDEX IF NOT EXISTS document_attachment_school_category_idx ON document_attachment(sekolah_id, category)`,
		`CREATE TABLE IF NOT EXISTS document_approval (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			document_type TEXT NOT NULL,
			entity_id TEXT,
			title_snapshot TEXT NOT NULL,
			version INTEGER NOT NULL DEFAULT 1,
			status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','diajukan','diperiksa','disetujui','ditolak','diterbitkan')),
			submitted_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			reviewed_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			approved_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			submitted_at TEXT,
			reviewed_at TEXT,
			approved_at TEXT,
			published_at TEXT,
			note TEXT,
			snapshot_json TEXT,
			parent_approval_id INTEGER REFERENCES document_approval(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS document_approval_school_status_idx ON document_approval(sekolah_id, status)`,
		`CREATE INDEX IF NOT EXISTS document_approval_entity_idx ON document_approval(sekolah_id, document_type, entity_id)`,
		`CREATE INDEX IF NOT EXISTS document_approval_parent_idx ON document_approval(parent_approval_id)`
	]);
}
