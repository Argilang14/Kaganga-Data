<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any -- ExcelJS type surface in this repo misses worksheet helpers used at runtime */
	import Icon from './icon.svelte';

	type MatevScore = {
		id: number;
		nama: string;
		score: number | null;
	};

	type Row = {
		peringkat: number;
		nama: string;
		nilaiRataRata: number | null;
		matevScores: MatevScore[];
	};

	let {
		rows,
		matevList,
		sekolahNama = 'Sekolah',
		kelasLabel = ''
	}: {
		rows: Row[];
		matevList: Array<{ id: number; nama: string }>;
		sekolahNama?: string;
		kelasLabel?: string;
	} = $props();

	function colLetter(col: number) {
		let result = '';
		while (col > 0) {
			const mod = (col - 1) % 26;
			result = String.fromCharCode(65 + mod) + result;
			col = Math.floor((col - 1) / 26);
		}
		return result;
	}

	function formatScore(value: number | null) {
		return value == null ? '' : Number(value.toFixed(2));
	}

	async function downloadLeger() {
		try {
			const { Workbook } = await import('exceljs');
			const workbook = new Workbook();
			const worksheet: any = workbook.addWorksheet('Leger Asrama');
			const headers = [
				'Peringkat',
				'Nama Siswa',
				...matevList.map((matev) => matev.nama),
				'Rata-rata Nilai Asrama'
			];

			worksheet.addRow(['REKAP NILAI ASRAMA']);
			worksheet.addRow([sekolahNama.toUpperCase()]);
			worksheet.addRow([kelasLabel]);
			worksheet.addRow([]);
			worksheet.addRow(headers);

			for (const row of rows) {
				const scoresByMatev = new Map(row.matevScores.map((score) => [score.id, score.score]));
				worksheet.addRow([
					row.peringkat,
					row.nama,
					...matevList.map((matev) => formatScore(scoresByMatev.get(matev.id) ?? null)),
					formatScore(row.nilaiRataRata)
				]);
			}

			const lastCol = headers.length;
			for (let col = 1; col <= lastCol; col += 1) {
				worksheet.getCell(`${colLetter(col)}1`).alignment = {
					horizontal: 'centerContinuous',
					vertical: 'middle'
				};
				worksheet.getCell(`${colLetter(col)}2`).alignment = {
					horizontal: 'centerContinuous',
					vertical: 'middle'
				};
			}

			worksheet.getRow(1).font = { bold: true, size: 12 };
			worksheet.getRow(2).font = { bold: true };
			worksheet.getRow(5).font = { bold: true };
			worksheet.getRow(5).height = 54;
			worksheet.columns = headers.map((header, index) => ({
				width: index === 1 ? 34 : Math.max(10, Math.min(22, header.length + 2))
			}));

			for (let col = 3; col <= lastCol - 1; col += 1) {
				worksheet.getRow(5).getCell(col).alignment = {
					textRotation: 90,
					wrapText: true,
					vertical: 'bottom',
					horizontal: 'center'
				};
				if (worksheet.columns[col - 1]) worksheet.columns[col - 1].width = 8;
			}

			const bottomRow = 5 + rows.length;
			for (let row = 5; row <= bottomRow; row += 1) {
				for (let col = 1; col <= lastCol; col += 1) {
					const cell = worksheet.getCell(`${colLetter(col)}${row}`);
					cell.border = {
						top: { style: 'thin' },
						left: { style: 'thin' },
						bottom: { style: 'thin' },
						right: { style: 'thin' }
					};
					cell.alignment = {
						...(cell.alignment ?? {}),
						vertical: 'middle',
						horizontal: col === 2 ? 'left' : 'center'
					};
				}
			}

			const buffer = await workbook.xlsx.writeBuffer();
			const blob = new Blob([buffer as BlobPart], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `${sekolahNama.replace(/[^a-z0-9\-_ ]/gi, '_')}_leger_asrama.xlsx`;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('download leger asrama error', error);
			alert('Gagal mendownload leger asrama. Lihat console untuk detail.');
		}
	}
</script>

<button
	class="btn btn-primary btn-soft shadow-none"
	type="button"
	onclick={downloadLeger}
	disabled={!rows.length}
	title="Download Leger Asrama (Excel)"
>
	<Icon name="download" />
	Download Leger Asrama (.xlsx)
</button>
