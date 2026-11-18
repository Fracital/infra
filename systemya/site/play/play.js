// Launches one game: its launch URL from Holy Unblocker's SDK, same-origin under /cdn/.
'use strict';

(async function () {
	const status = document.getElementById('status');
	const frame = document.getElementById('frame');
	const title = document.getElementById('title');
	const hu = globalThis.HU;
	const id = new URLSearchParams(location.search).get('id');

	document.getElementById('full').addEventListener('click', () => {
		if (!frame.hidden) frame.requestFullscreen?.();
	});

	if (!hu || !id) {
		status.textContent = hu
			? 'No game picked.'
			: 'Games are unavailable right now.';
		return;
	}
	try {
		const game = await hu.getGame(id);
		if (!game) {
			status.textContent = 'That game was not found.';
			return;
		}
		const meta = hu.resolveLaunchMetadata(game);
		if (!meta || !meta.url) {
			status.textContent = 'That game cannot be launched here.';
			return;
		}
		document.title = game.name + ' - SystemYA';
		title.textContent = game.name;
		frame.src = meta.url;
		frame.hidden = false;
		status.hidden = true;
		hu.countPlay?.(game.id);
	} catch (error) {
		status.textContent =
			'Games are unavailable right now. Try again in a minute.';
	}
})();
