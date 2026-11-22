'use strict';

// divide's address plan: the host's own addresses and every guest's vmbr1 address
// (172.16.5.0/24, gateway 172.16.5.1). `node infra.js` prints it and fails when an address or a
// VMID is used twice. docs/divide-host.md "Guests on vmbr1" is the prose version: change both.
// The meal-era plan (the meal, hd, run, fnaf and wisp pools) went with meal; it is in git history.

const host = {
	name: 'divide',
	public: '91.199.82.174', // bond0, the only address guests are reached on (DNAT)
	egress: '37.9.34.169', // VLAN 2832 (172.16.0.2), the provider NATs it; the edge leaves this way
	ipv6: '2a03:90c0:32:1::49f', // bond0; only the edge uses it, NAT66 from fd42:172:16:5::10
	lan: '172.16.5.1',
};

// [type, VMID, name, vmbr1 address]. VMs set their address inside the guest, so it is not in
// their Proxmox config; containers have it in net0.
const guests = [
	['ct', 100, 'vault', '172.16.5.63'],
	['vm', 101, 'mull', '172.16.5.6'],
	['vm', 104, 'eagler', '172.16.5.76'],
	['ct', 106, 'chat', '172.16.5.64'],
	['ct', 117, 'guca', '172.16.5.38'],
	['ct', 120, 'kru', '172.16.5.47'],
	['ct', 122, 'wispdev', '172.16.5.122'],
	['vm', 126, 'mac', '172.16.5.126'],
	['ct', 200, 'wg', '172.16.5.11'],
	['ct', 201, 'edge', '172.16.5.10'],
	['ct', 202, 'bs', '172.16.5.48'],
	['ct', 203, 'kn', '172.16.5.94'],
	['ct', 204, 'runner', '172.16.5.204'],
	['ct', 205, 'holy', '172.16.5.79'],
	['ct', 206, 'fg', '172.16.5.206'],
	['ct', 208, 'ci', '172.16.5.208'],
	['ct', 213, 'amph', '172.16.5.3'],
	['ct', 216, 'terp', '172.16.5.62'],
	['ct', 218, 'devbox', '172.16.5.217'],
	['vm', 9000, 'debian-template', null],
	['vm', 9001, 'ubuntu-template', null],
];

const byIp = new Map([[host.lan, host.name]]);
const byId = new Map();
let clashes = 0;

for (const [, id, name, ip] of guests) {
	if (byId.has(id)) {
		console.warn(`VMID ${id}: ${name} and ${byId.get(id)}`);
		clashes++;
	}
	byId.set(id, name);
	if (!ip) continue;
	if (!ip.startsWith('172.16.5.')) {
		console.warn(`${name}: ${ip} is not on vmbr1`);
		clashes++;
	}
	if (byIp.has(ip)) {
		console.warn(`${ip}: ${name} and ${byIp.get(ip)}`);
		clashes++;
	}
	byIp.set(ip, name);
}

console.log(
	`HOST ${host.name}: public ${host.public}, egress ${host.egress}, ipv6 ${host.ipv6}, vmbr1 ${host.lan}`,
);
for (const [type, id, name, ip] of guests)
	console.log(
		`${type.toUpperCase()} ${String(id).padEnd(4)} ${name.padEnd(16)} ${ip ?? '-'}`,
	);

if (clashes) process.exitCode = 1;
