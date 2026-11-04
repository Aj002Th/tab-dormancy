---
name: Starting work
description: Use when tab-dormancy work should move to a new branch, including a feature, fix, or optimization request
---

# Starting Work

Inspect the request on the current branch, then create the working branch before the first product edit.

## Prepare

1. Read the relevant code and summarize the requested change, the files it will touch, and any visible risk.
2. Run `git status --short`. If a tracked file is modified or staged, stop and ask before creating a branch. Untracked files that are not part of the request do not block it.
3. From the current `master` HEAD, create `feat/<topic>` or `fix/<topic>` with lowercase words.
4. Report the branch name and the one-paragraph analysis. Do not commit, push, or merge.

Product edits made before the branch exists belong on the new branch, not on `master`. If that happens, move them with `git stash`, create the branch, then restore them.
