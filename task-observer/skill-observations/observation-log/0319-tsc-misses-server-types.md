
`npx tsc -p tsconfig.json --noEmit` (as CLAUDE.local.md's headroom note suggests) passed locally, but CI's
`npm run -s types` failed on server/ashore.test.ts: the root tsconfig does not cover the server. Cost a 50-minute CI
round. Proposal: the headroom note and Toolkit.md say `npm run -s types`, not bare tsc. Also: client network tests
read target/protocol fixtures; run `cargo test -p protocol` first after a schema change.
