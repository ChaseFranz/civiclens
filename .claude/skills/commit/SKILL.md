# Commit

Generate a conventional commit message from staged changes and commit.

## Steps

1. Run `git diff --staged` to see what's staged. If nothing is staged, run `git status` and tell the user what's untracked/modified and ask them to stage first.
2. Analyze the diff and determine:
   - **type**: feat | fix | chore | refactor | test | docs | ci
   - **scope** (optional): the subsystem affected, e.g. `ingestor`, `search`, `stack`, `deps`
   - **description**: short imperative sentence, lowercase, no period
3. If the change spans multiple concerns, use the dominant type and note the rest in the body.
4. Produce the commit using this exact format:

```
git commit -m "$(cat <<'EOF'
<type>[optional scope]: <description>

[optional body — only if the why isn't obvious from the description]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

## Rules

- Never use `git add .` or `git add -A` — only commit what's already staged
- Keep the subject line under 72 characters
- Use imperative mood: "add", "fix", "remove" — not "added", "fixes", "removes"
- Do not mention file names in the subject unless the scope doesn't cover it
- Do not skip the Co-Authored-By trailer
