---
type: index
---
# Port

What Overlook takes from DFO Online, and what it leaves. DFO's work is ours to draw on
([[Built From What DFO Taught Us]]). Client code comes over as TypeScript; GPU code is rewritten for WebGPU; server and
rules code is rebuilt in Rust ([[Porting from DFO]]).

- [[Pick List]]: every DFO system, main and unmerged branches, with what comes over, what stays, and the effort.
- `Picks/`: one note per approved pick, made from the Pick template as it is ported.

## How the pick list reads

| Verdict | Meaning |
|---|---|
| **Clean** | Our own work with no Daggerfall data, lore, Daggerfall Unity translation, other author's mod or Morrowind in it. Bring it over as it is. |
| **Cut** | Our own logic that reads Daggerfall's data, lore or formulas through a seam. The logic comes over; the seam's content is replaced with our own. |
| **Can't** | Exists to read or imitate Daggerfall, Morrowind or Daggerfall Unity, or is another author's work. It stays. Anything of ours inside it is named. |

Effort is the size of the work to bring it over: **S** small, **M** medium, **L** large. Whether a system belongs in
Overlook is the owner's call alone: the list says what can come, never what should.
