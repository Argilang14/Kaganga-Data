type ClassQrDocument = {
	sekolahNama: string;
	contextLabel: string;
	cards: Array<{ nama: string; image: string }>;
};

const esc = (value: string) =>
	value.replace(/[\x26\x3c\x3e\x22\x27]/g, (char) => `&#${char.charCodeAt(0)};`);

export function renderClassQrHTML(data: ClassQrDocument) {
	const sheets: string[] = [];
	for (let index = 0; index < data.cards.length; index += 4) {
		sheets.push(
			`<section class="qr-sheet">${data.cards
				.slice(index, index + 4)
				.map(
					(card) =>
						`<article class="qr-card"><header>${esc(data.sekolahNama)}</header><h1>${esc(card.nama)}</h1><img src="${esc(card.image)}" alt="QR kelas ${esc(card.nama)}"><footer>${esc(data.contextLabel)}</footer></article>`
				)
				.join('')}</section>`
		);
	}
	return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>QR Kelas</title><style>
		@page{size:A4 portrait;margin:0}
		*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;font-family:Arial,Helvetica,sans-serif}
		.qr-sheet{width:210mm;height:297mm;padding:12mm;display:grid;grid-template-columns:repeat(2,89mm);grid-template-rows:repeat(2,125mm);gap:8mm;align-content:start;break-after:page}
		.qr-sheet:last-child{break-after:auto}
		.qr-card{width:89mm;height:125mm;padding:6mm;border:.25mm dashed #777;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;break-inside:avoid}
		header,footer{max-width:100%;font-size:9pt;line-height:1.3;overflow-wrap:anywhere}
		h1{max-width:100%;margin:4mm 0;font-size:17pt;line-height:1.15;overflow-wrap:anywhere}
		img{display:block;width:68mm;height:68mm;flex-shrink:0}footer{margin-top:4mm;color:#444}
	</style></head><body>${sheets.join('')}</body></html>`;
}
