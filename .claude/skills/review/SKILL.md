# Code Review

Review committed or staged changes as a fellow engineer — not a linter. Catch real problems, not noise.

## Input

Called with no args, or optionally:
- `/review` — review staged changes (if any), else last commit
- `/review HEAD~3..HEAD` — review a commit range
- `/review <sha>` — review a specific commit
- `/review staged` — review only what's staged

## Steps

### 1. Get the diff

```bash
# Staged only
git diff --staged

# Last commit (default fallback)
git diff HEAD~1..HEAD

# Range or specific SHA (use the arg verbatim)
git diff <arg>
```

Also run `git log --oneline -5` for context on what's happening in this branch.

### 2. Understand the change

Before commenting on anything, read the full diff to build a mental model:
- What problem is this solving?
- What is the author's intent?
- What invariants must hold for this to be correct?

Do NOT start leaving comments until you've read everything. First impressions from partial diffs produce noisy reviews.

### 3. Run structured analysis

Evaluate the diff across these dimensions in order of importance:

**Correctness**
- Off-by-one errors, null/undefined dereferences, wrong variable used
- Logic errors: conditions flipped, missing branches, incorrect operator precedence
- Race conditions or ordering assumptions that may not hold
- Data that could be in an unexpected shape (missing field, wrong type)

**Security**
- Injection vectors: SQL, shell, path traversal, template injection
- Secrets or credentials hardcoded or logged
- Auth/authz checks bypassed or weakened
- Input accepted from untrusted sources without validation
- Overly permissive IAM, CORS, or access policies (relevant for CDK/cloud code)

**Reliability**
- Unhandled error paths or swallowed exceptions
- Retry logic missing where the operation could transiently fail
- Timeouts not set on network calls
- Missing idempotency on operations that may be retried

**Performance**
- N+1 patterns: queries or API calls inside loops
- Unbounded data loads (no pagination, no limit)
- Expensive computation on hot paths
- Memory leaks: event listeners, timers, large buffers not released

**Maintainability**
- Code that's harder to read than it needs to be
- Magic numbers/strings that should be named constants
- Functions doing more than one thing
- Abstractions that don't pay for themselves

**Tests**
- Are new behaviors tested?
- Do the tests actually fail when the code is wrong (i.e., are they meaningful)?
- Are edge cases covered (empty input, zero, null, boundary values)?

### 4. Format the review

Use this exact structure:

---

## Code Review

**Scope:** `<what was reviewed — e.g. "last commit" or "HEAD~3..HEAD">`
**Files changed:** `<count>`

---

### Summary

One paragraph. Describe what the change does and your overall read: is this solid, does it need work, or are there blocking issues? Be direct.

---

### Issues

Group by severity. Omit a section entirely if there are no items in it.

#### Blocking
> These must be fixed before merging. Correctness bugs, security holes, data loss risk.

- **[file:line]** Description of the problem. Why it matters. What to do instead.

#### Suggestions
> Real improvements worth making — not blocking, but worth a discussion.

- **[file:line]** Description. Why it's better. Concrete alternative if possible.

#### Nits
> Minor style, naming, or clarity items. Low effort, take or leave.

- **[file:line]** Description.

---

### What's Good

Call out one or two things done well. Code reviews aren't only for finding problems — reinforce good patterns so they repeat.

---

## Rules

- **Be specific.** Vague feedback ("this is confusing") is useless. Point to the line and say why.
- **Suggest, don't demand.** For non-blocking items, offer an alternative rather than just flagging.
- **No nitpicks dressed as blockers.** Only block on things that actually matter: correctness, security, reliability.
- **Assume good intent.** The author isn't an idiot. If something looks wrong, consider whether you might be missing context before flagging it.
- **Skip what's fine.** You don't need to comment on every line. Silence means it's good.
- **No praise inflation.** "What's Good" is for genuinely well-done work, not participation trophies.
- **Cloud/CDK code:** Pay extra attention to IAM permissions (least-privilege), resource deletion policies, and whether infrastructure changes are backwards-compatible with live deployments.
