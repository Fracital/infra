#!/usr/bin/env bash
# Configure the GitHub side of this repository: settings, the `production` environment,
# the main-branch ruleset, the SSH_KNOWN_HOSTS variable and every Actions secret.
# Idempotent: run it again after a change and it converges.
#
#   scripts/github-setup.sh [--repo Fracital/infra] [--reviewer <github login>] [--dry-run]
#
# Needs: gh logged in as an admin of the repo, which must already exist (an org owner
# creates it). Never prints a secret value. --dry-run only reads.
#
# The CI SSH key: generated once into ~/.ssh/infra_ci_ed25519 (comment
# infra-ci@Fracital/infra) if that file does not exist, stored as INFRA_SSH_KEY, and its public
# half printed with the lines that authorize it on the hosts. Installing it on a host is a
# server change and is not done here.
set -euo pipefail

repo=Fracital/infra
reviewer=
dry=false
while [ $# -gt 0 ]; do
	case "$1" in
	--repo) repo=$2; shift 2 ;;
	--reviewer) reviewer=$2; shift 2 ;;
	--dry-run) dry=true; shift ;;
	*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done

here=$(cd "$(dirname "$0")" && pwd)
key=~/.ssh/infra_ci_ed25519
# The hosts apply.yml connects to: divide (the jump), edge, amph, terp.
hosts=(91.199.82.174 172.16.5.10 172.16.5.3 5.188.124.62)
# amph has no known_hosts entry under its private address on most machines; its key is the
# same VM's, recorded under its ssh alias.
declare -A alias=([172.16.5.3]=amph)

run() {
	if $dry; then printf 'would run: gh %s\n' "$*"; else gh "$@" >/dev/null; fi
}

if ! gh api "repos/$repo" --jq .full_name >/dev/null 2>&1; then
	echo "repo $repo does not exist or this gh account cannot see it; an org owner creates it first" >&2
	exit 1
fi
if [ "$(gh api "repos/$repo" --jq .permissions.admin)" != true ]; then
	echo "this gh account is not an admin of $repo" >&2
	exit 1
fi
[ -n "$reviewer" ] || reviewer=$(gh api user --jq .login)
reviewer_id=$(gh api "users/$reviewer" --jq .id)

echo "== repository settings"
run api -X PATCH "repos/$repo" -F has_wiki=false -F has_projects=false \
	-F delete_branch_on_merge=true -F allow_auto_merge=false
# Secret scanning and push protection are free on a public repository.
run api -X PATCH "repos/$repo" --input - <<'JSON'
{"security_and_analysis": {"secret_scanning": {"status": "enabled"},
                           "secret_scanning_push_protection": {"status": "enabled"}}}
JSON

echo "== actions"
# GITHUB_TOKEN is read-only unless a workflow asks for more, and cannot approve PRs.
run api -X PUT "repos/$repo/actions/permissions/workflow" \
	-f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
# Every outside contributor's pull request waits for approval before its workflows run.
run api -X PUT "repos/$repo/actions/permissions/fork-pr-contributor-approval" \
	-f approval_policy=all_external_contributors

echo "== environment production (reviewer: $reviewer, branch: main)"
run api -X PUT "repos/$repo/environments/production" --input - <<JSON
{"reviewers": [{"type": "User", "id": $reviewer_id}],
 "prevent_self_review": false,
 "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
if $dry || ! gh api "repos/$repo/environments/production/deployment-branch-policies" \
	--jq '.branch_policies[].name' 2>/dev/null | grep -qx main; then
	run api -X POST "repos/$repo/environments/production/deployment-branch-policies" \
		-f name=main -f type=branch
fi

echo "== ruleset: main is never deleted or force-pushed"
ruleset_id=$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name=="main") | .id' 2>/dev/null) || ruleset_id=
ruleset='{"name": "main", "target": "branch", "enforcement": "active",
 "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
 "rules": [{"type": "deletion"}, {"type": "non_fast_forward"}]}'
if [ -n "$ruleset_id" ]; then
	run api -X PUT "repos/$repo/rulesets/$ruleset_id" --input - <<<"$ruleset"
else
	run api -X POST "repos/$repo/rulesets" --input - <<<"$ruleset"
fi

echo "== variable SSH_KNOWN_HOSTS"
known=$(
	for h in "${hosts[@]}"; do
		name=${alias[$h]:-$h}
		lines=$(ssh-keygen -F "$name" 2>/dev/null | grep -v '^#' | awk -v h="$h" '{print h, $2, $3}')
		if [ -z "$lines" ]; then
			echo "no known_hosts entry for $h (looked up as $name); ssh to it once from here first" >&2
			exit 1
		fi
		printf '%s\n' "$lines"
	done
)
echo "$(wc -l <<<"$known") host keys for ${hosts[*]}"
if $dry; then
	echo "would set variable SSH_KNOWN_HOSTS"
else
	gh variable set SSH_KNOWN_HOSTS --repo "$repo" --body "$known" >/dev/null
fi

echo "== secret INFRA_SSH_KEY"
if [ ! -f "$key" ]; then
	if $dry; then
		echo "would generate $key"
	else
		ssh-keygen -q -t ed25519 -N '' -C "infra-ci@$repo" -f "$key"
	fi
fi
if ! $dry; then
	gh secret set INFRA_SSH_KEY --repo "$repo" --env production <"$key" >/dev/null
	echo "set INFRA_SSH_KEY (environment production)"
fi

echo "== vars-file secrets"
if $dry; then
	python3 -I "$here/sync-ci-secrets.py" --repo "$repo" --dry-run
else
	python3 -I "$here/sync-ci-secrets.py" --repo "$repo"
fi

if [ -f "$key.pub" ]; then
	pub=$(cat "$key.pub")
	guests=$(printf 'permitopen="%s:22",' 172.16.5.10 172.16.5.3)
	cat <<EOF

== not done here: authorize the CI key on the hosts (a server change)
amph, edge, terp (/root/.ssh/authorized_keys):
  $pub
divide (/root/.ssh/authorized_keys; jump only, to the guests' sshd; restrict alone still runs
commands, the forced /bin/false stops that):
  restrict,port-forwarding,command="/bin/false",${guests%,} $pub
EOF
fi
