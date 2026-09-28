#!/bin/sh
# Installs runtime dependencies for the design skills in .claude/skills.
# Runs on SessionStart; idempotent and quiet when everything is present.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Impeccable engine: downloads the pinned binary into ~/.impeccable on first run.
.claude/skills/impeccable/scripts/impeccable engine-probe >/dev/null 2>&1 || true

# Python packages used by the design skill's logo/icon/CIP generators.
python3 -c "import google.genai, PIL" >/dev/null 2>&1 || \
  python3 -m pip install -q google-genai pillow >/dev/null 2>&1 || true
exit 0
