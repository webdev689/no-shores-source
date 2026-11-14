---
type: index
---
# Port

What Overlook takes from DFO Online, and what it leaves. DFO's work is ours to draw on
([[Built From What DFO Taught Us]]). Client code comes over as TypeScript; GPU code is rewritten for WebGPU; server and
rules code is rebuilt in Rust ([[Porting from DFO]]).

- [[Pick List]]: every DFO system, `main` and the unmerged branches, with what comes over, what stays, and the
  effort, in four parts.
- `Picks/`: one note per approved pick, made from the Pick template as it is ported.

## How the pick list reads

| Verdict | Meaning |
|---|---|
| **Clean** | Our own work with no Daggerfall data, lore, Daggerfall Unity translation, other author's mod or Morrowind in it. Bring it over as it is. |
| **Cut** | Our own logic that reads Daggerfall's data, lore or formulas through a seam. The logic comes over; the seam's content is replaced with our own. |
| **Can't** | Exists to read or imitate Daggerfall, Morrowind or Daggerfall Unity, or is another author's work. It stays. Anything of ours inside it is named. |

| Lands as | Meaning |
|---|---|
| **TS port** | DFO's JavaScript copied, typed strictly, its seams cut, renamed to our names |
| **WebGPU rewrite** | GPU code rewritten for WebGPU and WGSL, with DFO's WebGL2 code as the specification |
| **Rust rebuild** | Rules the server decides, rebuilt in Rust with DFO's version as the specification |
| **Python** | Sprite forge code, which stays Python inside Blender |
| **Content rebuild** | A design and its geometry rebuilt as our own data, in our own formats, with our own art |
| **Practice** | A process or check to carry as an idea, not as code |

Effort is the size of the work to bring it over: **S** small, **M** medium, **L** large. Whether a system belongs in
Overlook is the owner's call alone: the list says what can come, never what should.
