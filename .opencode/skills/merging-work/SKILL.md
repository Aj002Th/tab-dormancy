---
name: Merging work
description: Use when finished tab-dormancy work on a feature branch should be merged back to master
---

# Merging Work

Clean the branch history, prove the tests, then merge locally. Keep the feature branch and do not push.

## Prepare

1. Run the relevant tests and fix failures before rewriting history.
2. Use `git status --short` and `git log --oneline master..HEAD` to review the branch.
3. Squash the branch into one conventional commit whose subject describes the completed change. Keep the working tree clean.
4. Run `npm test`. If it fails, stop.

## Merge

1. Check out `master` and fast-forward it to the feature branch.
2. Run `npm test` again on `master`.
3. Leave the feature branch in place. Do not delete it, push either branch, create a tag, or start a release unless the user gives that exact instruction.
