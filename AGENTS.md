<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vendored HeroUI skill: do not reinstall it

`.agents/skills/heroui-react/` is committed and pinned by
`.agents/skills/heroui-react.sha256`; CI fails if its content changes. Never
run the `curl … | bash` installer in its SKILL.md, and do not look for the
`heroui agents-md` command CLAUDE.md mentions — it does not exist; the docs in
`.heroui-docs/react` arrive with `npm install`. If the skill is updated on
purpose, regenerate the pin in the same commit:

    find .agents/skills/heroui-react -type f | LC_ALL=C sort | xargs shasum -a 256 > .agents/skills/heroui-react.sha256
