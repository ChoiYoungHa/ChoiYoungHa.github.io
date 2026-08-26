# R87-A tree replacement and house-roof structure audit

Date: 2026-08-27  
Branch: `wt/bench`  
Merged HEAD: `dd6b6f0`  
Execution: CPU-only; no build, preview, browser, or GPU work.

## D1 — measured giant-tree candidates

The measurements use `Automation/check-glb.mjs`: world-space indexed vertices,
leaf primitive classification from node/mesh/material names, alpha mode, and
green-dominant base color; the trunk sample is the bottom 12% of non-leaf
vertices and its radius is p90 distance from the median XZ center.

| Candidate | Source / license | Bytes | Tris | Crown width / height | Base radius / height | Leaf tris ratio | Result |
|---|---|---:|---:|---:|---:|---:|---|
| Big Tree | [3Donimus / Poly Pizza](https://poly.pizza/m/dNWh762PN-6), CC BY 3.0 | 3,407,832 | 34,980 | 0.770071 | 0.141181 | 0.773585 | PASS |
| tree_oak | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit), CC0 | 14,644 | 196 | 0.603184 | 0.157389 | 0.326531 | FAIL: crown, leaves |
| tree_fat | Kenney Nature Kit, CC0 | 5,576 | 50 | 0.656301 | 0.169214 | 0.800000 | FAIL: crown |
| tree_blocks | Kenney Nature Kit, CC0 | 10,128 | 132 | 0.506329 | 0.166483 | 0.863636 | FAIL: crown |
| tree_detailed | Kenney Nature Kit, CC0 | 31,412 | 402 | 0.635773 | 0.124807 | 0.696517 | FAIL: crown |
| BirchTree_2 (current) | [Quaternius](https://quaternius.com/packs/ultimatestylizednature.html), CC0 | 1,389,012 | 7,660 | 0.442055 | 0.020029 | 0.286684 | FAIL: crown, trunk, leaves |

Limits were crown/height >= 0.7, base radius/height >= 0.04, leaf tris ratio
>= 0.4, <= 40K tris, and <= 10 MiB. `Big Tree` is the only candidate that
passes every limit; its broad crown and thick, twisted trunk also match the
approved reference more closely than the thin BirchTree_2. It was retained
byte-for-byte as `DCC/incoming/asset.hero.tree.b/BigTree_3Donimus.glb`; the
required attribution is recorded beside it in `License.txt` and in
`DCC/incoming/assets-R87-A.csv`.

Machine-readable measurements: `Docs/qa/m5-tree-candidates-r87.json`.

## D4 — source house structure

All three files are uncompressed GLB v2 and each contains one node, one mesh,
one indexed TRIANGLES primitive, one material (`hexagons_medieval`), no
`COLOR_0`, and one embedded 1024x1024 PNG. The atlas SHA-256 is identical in
all three files:
`5301a06866ba3be68dcc14cc429bd6d0f69004b72884283715d7e233f2e9782e`.

| File | Bytes | Tris | Vertices | Primitive / material | Vertex color | UV min -> max |
|---|---:|---:|---:|---|---|---|
| `house_a.glb` | 72,524 | 1,011 | 1,540 | 1 / 1 | none | (0.151763, 0.029918) -> (0.856520, 0.969204) |
| `house_b.glb` | 99,296 | 1,393 | 2,305 | 1 / 1 | none | (0.151763, 0.029918) -> (0.856520, 0.969204) |
| `house_c.glb` | 188,028 | 2,992 | 4,778 | 1 / 1 | none | (0.151763, 0.018662) -> (0.866585, 0.969204) |

The red roof swatches sampled by triangle-centroid UV occupy approximately
U 0.155654–0.219350 and V 0.833182–0.969204 (house C begins at U 0.181604).
This is direct evidence that node-name or material-name classification cannot
separate a roof in the source files, while atlas UV/color classification can.

## Recommended roof-variation path and split result

Recommendation: adopt option (c), an offline primitive split, using the
measured red atlas swatch plus a normalized Y >= 25% guard. This is preferable
to a runtime UV shader branch because it produces explicit `*_body` and
`*_roof` nodes that the existing `classifyHouseMesh()` path can classify,
preserves the one shared material/atlas, and permits per-instance roof tint.
Pure Y-only splitting is not reliable: walls, chimneys, and trim overlap the
roof's vertical range, so `Automation/split-glb-roof.mjs` combines height with
the observed roof texel color.

| Output | Bytes | Body tris | Roof tris | Total preserved | GLB references |
|---|---:|---:|---:|---|---|
| `house_a_split.glb` | 79,272 | 859 | 152 | 1,011 | valid |
| `house_b_split.glb` | 108,340 | 1,193 | 200 | 1,393 | valid |
| `house_c_split.glb` | 206,664 | 2,918 | 74 | 2,992 | valid |

The generated files are in `public/models/` for master review. The original
position/normal/UV attributes, material, texture, scene transforms, and total
triangle counts are unchanged; only two new index accessors and explicit body
and roof nodes are added. Detailed validation is in
`Docs/qa/m5-house-split-r87.json`.

## Verification and residual risk

- `node --check Automation/check-glb.mjs`: exit 0.
- `node --check Automation/split-glb-roof.mjs`: exit 0.
- `npx oxlint Automation/check-glb.mjs Automation/split-glb-roof.mjs`: exit 0.
- `npx tsc -b`: exit 0.
- Full explicit Node regression: 44 test files, 352 passed, 0 failed,
  0 skipped/cancelled/todo (Node test duration 5.20s; tsc + tests 9.90s).
- GPU visual confirmation remains for master. In particular, house C has only
  74 red-atlas roof triangles; the split is structurally valid, but the exact
  artistic extent of its tint must be checked in the runtime scene before the
  replacement files are adopted.
