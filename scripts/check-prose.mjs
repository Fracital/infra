// Writing rules that no linter here expresses (AGENTS.md "Writing"):
//   - no em dashes and no curly quotes in any tracked text file
//   - no AI attribution trailers or "Generated with" lines in files, and, with
//     --commits <base> <head>, in the commit messages of that range (base all
//     zeros: every commit reachable from head)
//
// Exempt from the punctuation rules only (attribution is still checked):
// edge-wisp/patches/, verbatim git format-patch records of another project's
// commits, and blockshooter/site/, a verbatim mirror that crawl.py rewrites.
//
// Exit code 1 lists every offender.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Built from code points so this file never contains the characters it bans.
const EM_DASH = String.fromCharCode(0x2014);
const CURLY = new RegExp(
	`[${String.fromCharCode(0x2018, 0x2019, 0x201c, 0x201d)}]`,
);
const ATTRIBUTION =
	/co-authored-by:.*\b(claude|anthropic|copilot|chatgpt|openai|gemini|codex|cursor)\b|generated with \[?claude|\u{1f916} generated/iu;
// The rule files and this script quote the forbidden trailer on purpose.
const RULE_FILES = new Set([
	'AGENTS.md',
	'CLAUDE.md',
	'scripts/check-prose.mjs',
]);
const PUNCTUATION_EXEMPT = /^(edge-wisp\/patches|blockshooter\/site)\//;

const git = (...args) =>
	execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
const problems = [];
const [mode, base, head] = process.argv.slice(2);

if (mode === '--commits') {
	if (!base || !head) {
		console.error('usage: check-prose.mjs --commits <base-sha> <head-sha>');
		process.exit(2);
	}
	// A new branch's push has no base (all zeros): check every commit reachable from head.
	const range = /^0+$/.test(base) ? [head] : [`${base}..${head}`];
	const log = git('log', '--format=%H%x00%B%x01', ...range);
	for (const entry of log.split('\u0001')) {
		const [sha, body = ''] = entry.trim().split('\u0000');
		if (!sha) continue;
		if (ATTRIBUTION.test(body))
			problems.push(
				`${sha.slice(0, 7)}: commit message carries AI attribution`,
			);
		if (body.includes(EM_DASH))
			problems.push(`${sha.slice(0, 7)}: commit message contains an em dash`);
		if (CURLY.test(body))
			problems.push(
				`${sha.slice(0, 7)}: commit message contains a curly quote`,
			);
	}
} else {
	// Tracked and not-yet-tracked files, so the check works before the first commit too.
	const files = git(
		'ls-files',
		'-z',
		'--cached',
		'--others',
		'--exclude-standard',
	)
		.split('\0')
		.filter(Boolean);
	for (const file of [...new Set(files)]) {
		let buf;
		try {
			buf = readFileSync(file);
		} catch {
			continue; // deleted in the working tree
		}
		if (buf.includes(0)) continue; // binary
		const text = buf.toString('utf8');
		text.split('\n').forEach((line, i) => {
			const at = `${file}:${i + 1}`;
			if (
				!PUNCTUATION_EXEMPT.test(file) &&
				file !== 'scripts/check-prose.mjs'
			) {
				if (line.includes(EM_DASH)) problems.push(`${at}: em dash`);
				if (CURLY.test(line)) problems.push(`${at}: curly quote`);
			}
			if (!RULE_FILES.has(file) && ATTRIBUTION.test(line))
				problems.push(`${at}: AI attribution`);
		});
	}
}

if (problems.length) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log(mode === '--commits' ? 'commit messages ok' : 'prose ok');
