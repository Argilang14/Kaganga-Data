type PageOrientation = 'portrait' | 'landscape';

export function onePageFitStyles(orientation: PageOrientation, marginMm = 7): string {
	const pageWidth = orientation === 'landscape' ? 297 : 210;
	const pageHeight = orientation === 'landscape' ? 210 : 297;
	const contentWidth = pageWidth - marginMm * 2;
	const contentHeight = pageHeight - marginMm * 2 - 0.5;

	return (
		'.print-page{position:relative;width:' +
		contentWidth +
		'mm;height:' +
		contentHeight +
		'mm;overflow:hidden}.fit-content{position:absolute;inset:0 auto auto 0;width:' +
		contentWidth +
		'mm;transform-origin:top left}'
	);
}

export function onePageFitScript(): string {
	return [
		'<script>',
		'(() => {',
		'  const previousBefore = window.PagedConfig && window.PagedConfig.before;',
		'  window.PagedConfig = window.PagedConfig || {};',
		'  window.PagedConfig.before = async () => {',
		'    if (previousBefore) await previousBefore();',
		'    if (document.fonts && document.fonts.ready) await document.fonts.ready;',
		'    await Promise.all(Array.from(document.images).map((img) => {',
		'      if (img.complete) return Promise.resolve();',
		'      return new Promise((resolve) => {',
		"        img.addEventListener('load', resolve, { once: true });",
		"        img.addEventListener('error', resolve, { once: true });",
		'      });',
		'    }));',
		"    const page = document.querySelector('.print-page');",
		"    const content = document.querySelector('.fit-content');",
		'    if (!page || !content) return;',
		"    content.style.transform = 'none';",
		'    let scale = 1;',
		'    for (let attempt = 0; attempt < 4; attempt += 1) {',
		"      content.style.width = (page.clientWidth / scale) + 'px';",
		'      const nextScale = Math.min(',
		'        1,',
		'        page.clientWidth / Math.max(content.scrollWidth, 1),',
		'        page.clientHeight / Math.max(content.scrollHeight, 1)',
		'      );',
		'      if (Math.abs(nextScale - scale) < 0.002) { scale = nextScale; break; }',
		'      scale = nextScale;',
		'    }',
		"    content.style.width = (page.clientWidth / scale) + 'px';",
		'    const renderedWidth = content.scrollWidth * scale;',
		"    content.style.left = Math.max(0, (page.clientWidth - renderedWidth) / 2) + 'px';",
		"    content.style.transform = 'scale(' + scale + ')';",
		'    content.dataset.fitScale = scale.toFixed(4);',
		'  };',
		'})();',
		'</script>'
	].join('\n');
}
