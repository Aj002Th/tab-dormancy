---
name: Releasing
description: Use when releasing tab-dormancy, choosing 0.x.y, bumping versions, tagging, or rerunning a GitHub Release or Edge Add-ons publish after a failure
---

# Releasing Tab Dormancy

Release the commit the user asked to ship. A compatible feature stays on the patch number while the product is `0.x`; do not promote it to the next minor on your own.

## Version

| Change since the latest tag | Version |
|---|---|
| Fixes, copy, visual adjustments, or compatible behavior | `0.X.(Y+1)` |
| User-visible capability that changes existing behavior or requires migration | `0.(X+1).0` |
| User explicitly says the release is stable or major | `1.0.0` or the requested version |

When the changes mix fixes and compatible features, use the patch bump. State the choice and why in one sentence, then continue unless the user already requested a different version.

## One release commit

1. Check `git status`, `git log <latest-tag>..HEAD`, and GitHub Release assets. If HEAD is already the requested tag and the worktree is clean, do not create another version.
2. Set the same version in `package.json`, both version fields in `package-lock.json`, and `public/manifest.json`. Keep the manifest's existing formatting. `npm version X.Y.Z --no-git-tag-version` updates the first two.
3. Run `npm run verify`, then `npm run build`, then `npm run package:zip -- --tag vX.Y.Z`. The built `dist/manifest.json` must match `package.json`. The package name is `tab-dormancy-vX.Y.Z.zip`.
4. Commit exactly the three version files: `chore: release vX.Y.Z`. If a workflow fix is required for this release, include it in the same commit only when the user asks to ship that fix too.
5. Create `vX.Y.Z` on that commit and run `git push origin master --tags`. Pushing the tag starts `.github/workflows/release.yml`, which creates or updates the GitHub Release and publishes the same zip to Edge.

## Failed publish

Inspect the failed run before changing versions.

- Missing `release/tab-dormancy-vX.Y.Z.zip`: the workflow must pass `RELEASE_TAG` unchanged to `publish-edge.mjs`. Fix the workflow and release that correction as the next patch. Do not force-push or delete the tag unless the user explicitly requests history rewriting.
- Edge API `401`: the request shape is already `Authorization: ApiKey <EDGE_API_KEY>` and `X-ClientID: <EDGE_CLIENT_ID>`. Ask the user to renew the Partner Center API key and update the GitHub secret. Then rerun with `gh workflow run release.yml --ref master -f tag=vX.Y.Z`.
- A rerun updates the existing tag's Release. Do not delete the Release first and do not create another version just to retry.

## Stop

Stop before tagging if verify or packaging fails, the three versions differ, or the tag already points at a different commit. Report the blocker instead of deleting tags, force-pushing, or choosing a replacement version.
