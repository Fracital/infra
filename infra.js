'use strict';

const seen = new Set();

// IPv6 gateway is ::1 in every range; guests use ::<VMID>.
const meal =
	'.40 .65 .67 .68 .69 .125 .126 .127 .128 .131 .222 .228 .230 .248 .253';
const hd = '.24 .31 .43 .45 .47 .52 .54 .55 .58 .59 .60 .61 .62 .94 .95';
const fnaf =
	'.10 .11 .12 .13 .14 .97 .118 .119 .120 .121 .122 .123 .129 .132 .133';
const fnaf3 = '.8 .9 .16 .28 .50 .76 .79 .80 .83 .84 .85 .86 .88 .90 .91';
const wisp =
	'.53 .96 .98 .100 .101 .102 .103 .104 .106 .107 .110 .111 .112 .116 .117';
const run = '.18 .21 .30 .32 .35 .38 .39 .41 .42 .44 .48 .56 .57 .63 .64';

const ipMaps = {
	meal: ipMap('meal', meal, '2a03:90c0:35:2902::/64', 'fd42:172:16:5::/64'),
	hd: ipMap('hd', hd, '2a03:90c0:34::/48'),
	fnaf: ipMap('fnaf', fnaf, '2a03:90c0:34::/48'),
	fnaf3: ipMap('fnaf3', fnaf3, '2a03:90c0:34::/48'),
	wisp: ipMap('wisp', wisp),
	run: ipMap('run', run, '2a03:90c0:34::/48'),
};
const ipPoolsByIp = poolIndex(ipMaps);

// run (divide.run) and hd (divide.hd) were wiped on 2026-11-16. holy, giftshop and caan moved to
// meal first; nothing else on them was kept. The servers aren't cancelled yet: .18 and .24 still
// answer, and their pools stay listed because meal guests use hd- and run-pool addresses. Those only
// keep working if G-Core moves the pools to meal before the servers are cancelled.
register('run', 'wiped', '5.4 .18'); // run's main address, 2a03:90c0:34::b/48
register('hd', 'wiped', '5.2 .24'); // hd's main address, 2a03:90c0:34::2d/48

// fanq's hosts reserve their whole pools.
host(ipMaps.fnaf, fnaf); // 2a03:90c0:34::5/48
host(ipMaps.fnaf3, fnaf3); // 2a03:90c0:34::4/48
host(ipMaps.wisp, wisp); // 2a03:90c0:34::1f/48

// meal, host 2a03:90c0:35:2902::253/64; stale proxy-NDP entries for a guest's ::<VMID> break its DAD.
// IPv6 is ::<VMID> unless a guest gives its own address, or "none" when it has no static IPv6.
{
	const { pct, qemu } = host(ipMaps.meal, '5.1 .253');
	pct(100, 'vault', '5.63', 'fd42:172:16:5::104');
	pct(106, 'chat', '5.64', 'private');
	pct(112, 'sm', '5.37', 'private');
	pct(114, 'dab', '.128');
	pct(117, 'guca', '5.38', 'private');
	pct(120, 'kru', '5.47 .56'); // also fd42:172:16:5::120 on eth0
	qemu(101, 'mull', '5.6', 'private');
	qemu(102, 'amplify', '.30'); // stopped
	qemu(103, 'git2', '5.75 .64', '2a03:90c0:35:2902::1033'); // stopped
	qemu(104, 'eagler', '5.76 .125', 'none'); // ip6=dhcp
	qemu(105, 'fun', '.38');
	// plunk (stopped): .58 on net2 (enp6s20), .61 on net3 (enp6s21)
	qemu(107, 'plunk', '.58 .61 5.74', '2a03:90c0:35:2902::103');
	// fog: .10 is borrowed from fanq's fnaf pool (net2)
	qemu(108, 'fog', '5.72 .69 .10');
	qemu(109, 'xmpp', '.59'); // stopped
	qemu(110, 'fum', '.39 5.39');
	qemu(111, 'giftshop', '5.78', 'fd42:172:16:5::123'); // moved from run VM 111 on 2026-11-16
	qemu(113, 'amph', '.41 .55 5.3');
	qemu(115, 'wisp-mnz', '.228 .32 .35 .42 .48 .63'); // wisp.baby Manassas edge: .228 wisp.baby (carbon's old VMID and IP), .32 .35 .42 byod, .48 .63 fracital
	qemu(116, 'terp', '.62');
	qemu(121, 'fan', '.131'); // stopped
	qemu(122, 'wispdev', '.126');
	qemu(123, 'kn-mnz', '.94', 'none'); // KrunkNative game servers, Ashburn/Manassas (2026-11-13)
	qemu(124, 'simo', '.248');
	qemu(125, 'bs-mnz', '.95', 'none'); // blockshooter game servers, Ashburn/Manassas (2026-11-14)
	qemu(126, 'tahoe', '.52', 'none'); // Hackintosh (macOS Tahoe), moved from hd VM 104 on 2026-11-16
	qemu(127, 'holy', '5.79 .65', 'none'); // moved from run VM 110 on 2026-11-16; ip6=dhcp
	qemu(128, 'caan', '5.70 .230', '2a03:90c0:35:2902::125'); // moved from run VM 113 on 2026-11-16
}

function host(ipMap, ips) {
	if (ips) {
		const pub = register('host', ipMap.name, ips);
		console.log(
			`HOST { pool: ${ipMap.name}, ips: ${formatIps(pub).join(', ')} }`,
		);
	}

	return {
		pct(id, name, ips, ipv6Scope) {
			const pub = register(id, name, ips);
			console.log(
				`PCT { name: ${name}, id: ${id}, primary, ips: ${formatIps(pub).join(',')}${formatIpv6(ipMap, id, ipv6Scope)} }`,
			);
		},

		qemu(id, name, ips, ipv6Scope) {
			const pub = register(id, name, ips);
			console.log(
				`QEMU { name: ${name}, id: ${id}, ips: ${formatIps(pub).join(',')}${formatIpv6(ipMap, id, ipv6Scope)} }`,
			);
		},
	};
}

function register(id, name, ips) {
	const pub = pubMap(ips);
	for (const i of pub)
		if (seen.has(i)) console.warn(id, name, 'bruh already seen this', i);
	for (const i of pub) seen.add(i);
	return pub;
}

function ipMap(name, ips, ipv6Range, privateIpv6Range) {
	return { name, ips: pubMap(ips), ipv6Range, privateIpv6Range };
}

function poolIndex(ipMaps) {
	return new Map(
		Object.values(ipMaps).flatMap((ipMap) =>
			ipMap.ips.map((ip) => [ip, ipMap.name]),
		),
	);
}

function formatIps(ips) {
	return ips.map((ip) => {
		const pool = ipPoolsByIp.get(ip);
		if (!pool) return ip;
		return `${pool}:${ip}`;
	});
}

function formatIpv6(ipMap, id, scope = 'public') {
	if (scope === 'none') return '';
	if (scope.includes(':')) return `, ipv6: ${scope}/64`;
	const range = scope === 'private' ? ipMap.privateIpv6Range : ipMap.ipv6Range;
	if (!range) return '';
	const [prefix, length] = range.split('/');
	return `, ipv6: ${prefix}${id}/${length}`;
}

function remainingIps(ipMaps) {
	return Object.fromEntries(
		Object.values(ipMaps).map((ipMap) => [
			ipMap.name,
			ipMap.ips.filter((ip) => !seen.has(ip)),
		]),
	);
}

function pubMap(pub) {
	return pub
		.split(' ')
		.map((e) => (e.startsWith('5.') ? '172.16.' + e : '5.188.124' + e));
}

console.log(remainingIps(ipMaps));
