# wispurr relay patches

> **Historical (2026-11).** The fleet (4 edges + amph) no longer runs wispurr: the
> `edge_wisp` role builds and deploys [holyWisp](https://github.com/Fracital/holyWisp),
> a C11 Wisp server, and `tasks/build.yml` no longer applies these patches to
> anything. The set is kept as the list of relay bugs holyWisp was audited
> against before the switch (CONNECT flush race, egress DATA sizing, egress
> back-pressure, ingress window). Rollback to wispurr: `deploy/ansible/README.md`
> "Rollback to wispurr". Everything below describes the wispurr era as it was.

These `.patch` files are abulxt's **optional** fixes to the Go `wispurr` relay.
They can be applied on top of the **pinned upstream** at build time. This is
**not** a maintained fork repo.

**Not applied by default (since 2026-10-10).** `wispurr_patch_dir` in
`deploy/ansible/roles/edge_wisp/defaults/main.yml` defaults to `""`, so the
edges run stock upstream wispurr. To re-enable, point `wispurr_patch_dir` at
this directory. The former Wisp frame-cloak patches are gone; the relay is
plain Wisp over TLS and the `/wisp/<gate_key>/` key is the only access control.

Telling the builds apart: an unpatched binary is
`wispurr-<commit>-linux-amd64` and `go version -m <binary>` shows
`vcs.modified=false`; a patched one is `wispurr-<commit>-patched<hash>-linux-amd64`
with `vcs.modified=true`. A `-cloak<hash>` suffix is a cloak-era binary.

- **Base:** `sylvieisnton/wispurr` tag **`v4.2.1`** (commit `5dfed81`), the exact
  tree the `edge_wisp` ansible role builds (`wispurr_repo` / `wispurr_ref` in
  `deploy/ansible/roles/edge_wisp/defaults/main.yml`).
- **Format:** `git format-patch` output, one commit per patch. Apply with
  `git am` or `git apply`.
- **Transport:** plain Wisp over TLS. The relay takes no per-frame transform,
  and these patches do not change the wire format.

## What each patch does

| Patch | Summary |
|-------|---------|
| `0001-*-fix-CONNECT-flush-race*` | Fixes a race in CONNECT that drops DATA. `handleConnect` flushed the DATA that `handleDataPacket` buffered during CONNECT from one snapshot, without the lock, then marked the stream ready. DATA that arrived during the flush was appended after the snapshot and never written, so a TLS tail could go missing (browser errors 35/55/60). `flushPendingAndMarkReady` (`wisp-stream.go`) now loops until the buffer is empty and sets `connReadyDone` under `pendingMutex`. `wisp/flush_test.go` fails on the snapshot logic and passes with the fix. |
| `0002-*-size-egress-DATA-frames-to-maxPayloadSize*` | Egress mirror of the inbound size gate. The stream read loop read up to `TcpBufferSize` (default `maxPayloadSize`, 256 KiB) and emitted a DATA packet of `5 + n` bytes, which is up to 5 bytes over `maxPayloadSize`. `maxEgressDataPayload()` (`wsreader.go`) caps one DATA packet's data so the WebSocket message stays within `maxPayloadSize`. A larger upstream read spans several DATA packets, which Wisp allows. No wire-format change. This is a correctness and symmetry fix, not the cause of the download kill (that is 0003). |
| `0003-*-back-pressure-stream-egress*` | Fixes the whole-mux kill on downloads. `submitWrite` (`wisp-connection.go`) dropped the whole WebSocket as soon as the per-connection egress queue would exceed `PendingQueueSize` (64 MiB). Parallel downloads from a fast origin filled it in milliseconds. Stream DATA now parks the stream's read loop on a condition variable while the queue is full, so TCP flow control slows the origin. Protocol control frames bypass the gate. A last-resort cap 25% above `PendingQueueSize` keeps the old drop for a control-frame flood. `wisp/backpressure_test.go` covers parking, control-frame bypass and wake-on-close. |
| `0004-*-ingress-window*` | Upload mirror of 0003. `submitIngress` (`wisp-stream.go`) closed a stream with `0x49` (THROTTLED) when its ingress queue overflowed, and the client was never slowed first. `ingressWindow()` (`wisp-connection.go`) bounds the advertised CONTINUE window so a full window of maximum-size packets fits in half the queue. The budget is replenished only as the upstream actually drains. The `0x49` cap stays as a backstop. `wisp/ingress_flowcontrol_test.go` covers both. |

## Apply order

Numeric order, `0001` to `0004`. Each patch applies on top of the previous one,
and the tree builds after each and after all four.

```sh
git clone --branch v4.2.1 https://github.com/sylvieisnton/wispurr.git src
cd src
git am /path/to/deploy/edge-wisp/patches/*.patch   # 0001 through 0004
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o wispurr .
```

The `edge_wisp` role does this when `wispurr_patch_dir` is set (see
`deploy/ansible/roles/edge_wisp/tasks/build.yml`). It applies the patches with
`git apply` in sorted filename order. With the default `""` it builds plain
upstream and this directory is unused.

## Tests

From the patched tree: `go test ./wisp/`. The tests that cover the patches are
`flush_test.go`, `backpressure_test.go` and `ingress_flowcontrol_test.go`.

## Regenerating these patches

1. Clone the pinned base and apply the current patches:
   ```sh
   git clone --branch v4.2.1 https://github.com/sylvieisnton/wispurr.git /tmp/wispurr-dev
   cd /tmp/wispurr-dev && git am /path/to/patches/*.patch
   ```
2. Make changes, `git commit`.
3. Regenerate: `git format-patch --no-cover-letter v4.2.1..HEAD -o /path/to/deploy/edge-wisp/patches`
4. Verify: fresh clone of the base, `git am` the new patches, `go test ./wisp/`
   and `go build`.

> Changing these patches changes what runs on the edges. Building is fine;
> **deploying is authorization-gated** (AGENTS.md Hard rules).
