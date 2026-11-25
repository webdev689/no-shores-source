#!/bin/bash
# Whether a deploy from main is due: the `ready` step of each Worker's workflow (rooms.yml, bot.yml) runs it.
#
#   bash .github/deploy-ready.sh <environment> <what>
#
# <environment> is the GitHub environment the deploy job records its deployments against; <what> names it in the log.
# From the environment: CODE, the paths what is deployed is built from (a `:!path` leaves one out); HAS_TOKEN and
# BY_HAND, "true" or not; GH_TOKEN for the GitHub CLI; and the runner's own GITHUB_REPOSITORY, GITHUB_SHA and
# GITHUB_OUTPUT. It writes deploy=yes, deploy=no (nothing to deploy, or main moved past this commit) or deploy=blocked
# (something to deploy and no Cloudflare token), and fails a run by hand on a commit whose CI check did not pass.
set -euo pipefail

environment=$1
what=$2
repo=$GITHUB_REPOSITORY
sha=$GITHUB_SHA
head=$(gh api "repos/$repo/commits/main" --jq .sha)
# The commit last deployed: the newest deployment to the environment whose last word is success. With none found, it
# deploys.
list=$(gh api "repos/$repo/deployments?environment=$environment&per_page=30" --jq '.[] | "\(.sha) \(.id)"') || list=""
deployed=""
while read -r one id; do
  [ -n "$id" ] || continue
  state=$(gh api "repos/$repo/deployments/$id/statuses" --jq '.[0].state') || state=""
  if [ "$state" = success ]; then
    deployed=$one
    break
  fi
done <<< "$list"
# Whether this commit passed main's CI check: a check run named `check`, of GitHub Actions, that succeeded.
passed() {
  gh api "repos/$repo/commits/$sha/check-runs?check_name=check" \
    --jq 'any(.check_runs[]; .app.slug == "github-actions" and .conclusion == "success")'
}
# Every path, whether the workflow folds them onto one line or gives each its own.
read -r -d '' -a code <<< "$CODE" || true
if [ "$head" != "$sha" ]; then
  echo "main has moved past this commit; its own run deploys $what"
  echo "deploy=no" >> "$GITHUB_OUTPUT"
elif [ "$BY_HAND" = "true" ] && [ "$(passed)" != true ]; then
  echo "::error::a run by hand deploys $what only from a commit that passed the CI check, and this one has not"
  exit 1
elif [ "$BY_HAND" != "true" ] && [ -n "$deployed" ] && git diff --quiet --no-renames "$deployed" HEAD -- "${code[@]}"; then
  echo "the code of $what is as deployed from $deployed: nothing to deploy"
  echo "deploy=no" >> "$GITHUB_OUTPUT"
elif [ "$HAS_TOKEN" != "true" ]; then
  echo "::warning::the repository has no CLOUDFLARE_TOKEN secret, so nothing of $what was deployed"
  echo "deploy=blocked" >> "$GITHUB_OUTPUT"
else
  echo "deploy=yes" >> "$GITHUB_OUTPUT"
fi
