#!/bin/bash
set -e

# Restore all git changes
git restore -s@ -SW  -- packages docs

# Release all packages to npm registry
pnpm release

# Get the latest and pre-latest git tags
LATEST_TAG=$(git tag --sort=-creatordate | sed -n '1p')
PREV_TAG=$(git tag --sort=-creatordate | sed -n '2p')

# Generate changelog
pnpm changelogen --output CHANGELOG.md --from=$PREV_TAG --to=$LATEST_TAG

# Wait for user to review and edit changelog
echo "Press ENTER when ready to commit changes..."
read

# Commit and push changelog
git add CHANGELOG.md && git commit -m "chore(release): $LATEST_TAG" && git push

# Sync github releases with changelog
pnpm changelogen gh release