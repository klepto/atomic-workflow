# Code style

Read `CONVENTIONS.md` at the root of the repository before you change code, and follow it.

# Testing

The project is a prototype. Write tests as `## Tests` of `CONVENTIONS.md` says.
Verify a change in `mcp/` with `npm run typecheck` and `npm test` in `mcp/`.
Verify a change in `web/` with `npm run typecheck`, `npm test` and `npm run build` in `web/`.

# Build output

The plugin runs from the built files in `plugin/dist/`, which are committed. Before you commit a feature or a fix,
rebuild them: run `npm run build` in `mcp/` for a change in `mcp/`, and in `web/` for a change in `web/`. Commit the
changes of `plugin/dist/` in the same commit as the change of the source.
