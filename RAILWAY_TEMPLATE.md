# Deploy and Host OpenCode Computer on Railway

Give OpenCode a persistent, private computer on Railway. This template deploys one OpenCode-ready Linux service with a persistent volume mounted at `/data`. Provider authentication, configuration, sessions, plugins, skills, and repositories survive redeploys. The template does not create a public domain or TCP proxy.

OpenCode Computer is an independent project. It is not built by, maintained by, or affiliated with the OpenCode team.

## About Hosting OpenCode Computer

OpenCode Computer packages the pinned OpenCode CLI and server, Railway CLI, GitHub CLI, Git, tmux, ripgrep, Python, Node.js, and common development tools into a durable remote environment. User projects live in `/data/workspace`; OpenCode's complete XDG config, data, state, and cache hierarchy lives beneath `/data/home`; global skills are available at `/data/skills`.

The native OpenCode server is password-protected and listens only on `127.0.0.1:4096`. Railway health uses a separate listener that exposes only `/livez` and `/readyz`. The future Agent Computer app will reach OpenCode through an authenticated bridge. Railway SSH remains available as an optional direct-access and recovery path.

## Common Use Cases

- Keep OpenCode projects and sessions running away from a laptop.
- Continue work from desktop and mobile clients against one persistent environment.
- Use any OpenCode-supported model provider without rebuilding the image.
- Maintain durable agents, plugins, skills, configuration, and repositories.
- Use Railway SSH and the attached OpenCode TUI while integrating the Agent Computer UI.

## Dependencies for OpenCode Computer Hosting

- A Railway account with capacity for one service and one persistent volume.
- An account or API credential for any provider supported by OpenCode.
- Optional: the Railway CLI and a local public SSH key for direct SSH access.

### Deployment Dependencies

This template builds from the public `m-abdelwahab/opencode-computer` GitHub repository. Railway creates one service and attaches one volume at `/data`. No external database, public domain, or TCP proxy is required. The current OpenCode data store uses SQLite, so keep the service at one replica with the volume attached.

## Why Deploy OpenCode Computer on Railway?

Railway supplies the persistent storage, compute, deployment lifecycle, metrics, and private access primitives needed by a remote coding computer. The template keeps those infrastructure details behind a single deployable unit while preserving Railway as an escape hatch.

For direct setup or troubleshooting, use Railway SSH:

```bash
railway ssh --project "$PROJECT_ID" --service opencode-computer
```

Then connect a provider and attach to the already-running private server:

```bash
opencode auth login
opencode-computer-attach
```

Provider-specific API keys can also be configured as Railway variables. Your private SSH keys remain on your local computer; Railway receives only public SSH keys when you opt into direct SSH access.
