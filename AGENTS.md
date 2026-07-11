# Repository guidance

- OpenCode Computer is independent and must not imply affiliation with the OpenCode team.
- Keep the Railway service private: do not add a public domain or TCP proxy.
- `/data` is the persistent volume. User files live in `/data/workspace`.
- Persist OpenCode's config, data, state, and cache XDG roots beneath `/data/home`.
- Keep `/data/home/.config/opencode/skills` as a validated link to `/data/skills`.
- Pin OpenCode and Railway CLI versions in the Dockerfile. Do not use `latest`, and keep OpenCode autoupdates disabled.
- OpenCode must bind to `127.0.0.1:4096` with authentication. Never bind its native API to `$PORT`.
- `agentd` must bind to loopback and advertise only implemented capabilities.
- Keep Railway health limited to `/livez` and `/readyz`; never expose control metadata on `$PORT`.
- Keep the `computer` and `agentd` Unix identities separate.
- Do not broaden the runtime user's `sudo` access beyond the two fixed boot wrappers.
- Run `npm run check` after JavaScript changes.
- Validate Docker changes with a clean image build and a Railway smoke deployment.
