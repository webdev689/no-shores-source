
Server tests (roomDoor, island rooms) load client/public/*.wasm. After a merge that changes room/room-wasm, 5 server
tests failed ("entry is not a function") until `npm run -s wasm` rebuilt it; then all 691 passed. Proposal: Toolkit.md
says run `npm run -s wasm` before server tests whenever crates/room* changed.
