// SystemYA's game grid, read through Holy Unblocker's SDK (globalThis.HU, from /cdn/index.js).
'use strict';

(function () {
	const PAGE = 48;
	const grid = document.getElementById('grid');
	const status = document.getElementById('status');
	const more = document.getElementById('more');
	const form = document.getElementById('search');
	const q = document.getElementById('q');
	const sort = document.getElementById('sort');

	const hu = globalThis.HU;
	if (!hu) {
		status.textContent =
			'Games are unavailable right now. Try again in a minute.';
		return;
	}

	let page = 1;
	let pages = 1;
	let request = 0;

	function card(game) {
		const li = document.createElement('li');
		const a = document.createElement('a');
		a.className = 'card';
		a.href = '/play/?id=' + encodeURIComponent(game.id);
		const img = document.createElement('img');
		img.loading = 'lazy';
		img.alt = '';
		img.src = game.imagePath || hu.getImageUrl(game.id);
		const name = document.createElement('span');
		name.textContent = game.name;
		a.append(img, name);
		li.append(a);
		return li;
	}

	async function load(reset) {
		const mine = ++request;
		if (reset) {
			page = 1;
			grid.replaceChildren();
		}
		status.textContent = 'Loading games...';
		status.hidden = false;
		more.hidden = true;
		try {
			const params = { sort: sort.value, limit: PAGE, page };
			const text = q.value.trim();
			if (text) params.search = text;
			const data = await hu.query(params);
			if (mine !== request) return;
			const games = data.games || data.entries || [];
			grid.append(...games.map(card));
			pages = data.pages || 1;
			status.hidden = grid.children.length > 0;
			if (!grid.children.length) status.textContent = 'No games found.';
			more.hidden = page >= pages;
		} catch (error) {
			if (mine !== request) return;
			status.textContent =
				'Games are unavailable right now. Try again in a minute.';
		}
	}

	let timer = 0;
	q.addEventListener('input', () => {
		clearTimeout(timer);
		timer = setTimeout(() => load(true), 250);
	});
	sort.addEventListener('change', () => load(true));
	form.addEventListener('submit', (event) => {
		event.preventDefault();
		load(true);
	});
	more.addEventListener('click', () => {
		page += 1;
		load(false);
	});

	load(true);
})();
