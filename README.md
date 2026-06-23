# Deploys.app Docs

Documentation site for [Deploys.app](https://www.deploys.app), built with
**Hugo extended 0.161.1** (pinned in `.tool-versions` — run `asdf install`).

## Commands

- `make dev` — local server with live reload (http://localhost:1313).
- `make build` — static output in `/public/`.

## Layout

Content lives in `content/` as nested sections; the left sidebar is generated
from the section tree (ordered by front-matter `weight`). The design system
mirrors the Deploys.app console — magenta "signal" primary on Ink (dark) /
Paper (light) surfaces, Hanken Grotesk + JetBrains Mono. Tokens live in
`assets/style/_theme.scss`.

Console screenshots in `assets/img/` are captured from the console's mock
server (`bun dev:mock`) — see the console repo. They are served through Hugo
Pipes with a content hash in the filename (`/img/<name>.<hash>.png`) so a
re-captured screenshot busts the browser/CDN cache automatically.
