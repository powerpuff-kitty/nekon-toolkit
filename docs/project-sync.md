# Project 14 synchronization

All 31 repository issues were created through the authorized GitHub connector.
The available connector exposes no Projects read/write actions, and this runtime
has no authenticated `gh` command. Board membership and custom-field values have
therefore not been changed or verified by this implementation.

Run `node scripts/sync-project.mjs --dry-run` without any credentials to inspect
the fixed repository/owner/project and issue URLs. Run the same command with
`--apply` from a machine with the GitHub CLI installed and authenticated with
sufficient Project access. No token should be pasted into this repository or chat.

The helper lists existing items, adds only missing issue URLs, and re-reads the
board to verify membership. It does not delete/archive items, edit statuses or
priorities, enable workflows, or change permissions. It stops on an incomplete
inventory (including boards at the conservative 1,000-item bound), ambiguous
responses or failed writes. Successful earlier additions remain after a later
failure; rerunning checks membership before adding anything again. Eventual API
visibility may require rerunning verification after inspecting the board.

Dry-run and mocked integration/failure paths are tested. Live Project mutation is
not tested here. `roadmap.json` records intended priorities/phases/plan state, not
live GitHub fields. The initial helper deliberately preserves existing board
configuration; custom-field synchronization is a separate change.

Official command contracts checked on 2026-09-11:
- https://cli.github.com/manual/gh_project_item-add
- https://cli.github.com/manual/gh_project_item-list
