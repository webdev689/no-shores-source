---
type: reference
---
# Platform Research

What the browsers and Cloudflare offer for the game's interface, its threads and its network, as researched on
2026-11-20, with the sources each finding rests on. The decisions built on it:
[[The Interface Uses No HTML, Now or Later]], [[Work Leaves the Main Thread Where It Can]],
[[The Network Is Made Smaller and Readied for WebTransport]].

## The interface

- **Text.** Pixelify Sans's glyphs are straight lines on a grid whose cells are not whole pixels (at 11 px a cell is
  1.21 px wide), so a browser's own text drawing blurs them. Sampled at each cell's centre they make clean one-bit
  glyphs, drawn sharp at whole multiples with no filtering; signed-distance fonts would leave grey edges on them.
  [Crisp pixel art (MDN)](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look),
  [WebGPU](https://www.w3.org/TR/webgpu/).
- **Drawing.** One pipeline and one instanced draw serve every panel and letter, each quad clipped in the vertex
  shader; a canvas cannot be configured in an sRGB format, so the interface blends premultiplied into its plain view.
  [GPUCanvasContext.configure (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure).
- **Layout.** Measured on a tree of 661 nodes: Yoga 3.2 relays it in 3.5 ms (50 KB), Taffy 0.14 in 1.1 ms (34 to
  90 KB), a small layout of the game's own after Clay's model in 0.03 ms.
  [Yoga 3.0](https://www.yogalayout.dev/blog/announcing-yoga-3.0).
- **Typing.** `EditContext` lets a canvas take typing and composition without an input; only Chromium ships it
  (since January 2024), and it is a W3C working draft. Elsewhere keys and paste are all a canvas gets, and iOS shows
  no keyboard for one. [EditContext](https://www.w3.org/TR/edit-context/),
  [its support](https://web-platform-dx.github.io/web-features-explorer/features/edit-context/),
  [Clipboard API](https://www.w3.org/TR/clipboard-apis/).
- **Accessibility.** A canvas gives a screen reader nothing but its label; `document.ariaNotify()`, in every major
  browser since September 2026, speaks announcements.
  [ariaNotify](https://web-platform-dx.github.io/web-features-explorer/features/arianotify/),
  [Google Docs on canvas](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html).
- **Size.** `devicePixelContentBoxSize` gives a canvas's size in device pixels where the browser has it (not Safari).
  [device-pixel-content-box](https://web.dev/articles/device-pixel-content-box).

## Threads

- **WebGPU in a worker.** Every browser that runs the game (Chrome and Edge 113 on, Firefox 141 on Windows and Apple
  silicon, Safari 26 on macOS Tahoe and iOS 26) runs WebGPU through an `OffscreenCanvas` in a dedicated worker, with
  `requestAnimationFrame` there; a device cannot be shared between threads.
  [OffscreenCanvas](https://web.dev/articles/offscreen-canvas),
  [three.js on OffscreenCanvas](https://threejs.org/manual/en/offscreencanvas).
- **What stays on the page.** Input, pointer lock, fullscreen, gamepads, `AudioContext` and typing exist only on the
  main thread. A whole engine run in a worker, fed input by messages, is shipped by Construct 3.
  [Construct 3's worker mode](https://www.construct.net/en/blogs/ashleys-blog-2/performance-isolation-html5-1512).
- **Messages.** A message of a few kilobytes costs well under a frame; transferred buffers cost the same at any size.
  [Is postMessage slow?](https://surma.dev/things/is-postmessage-slow/)
- **Shared memory.** `SharedArrayBuffer` needs cross-origin isolation headers, which GitHub Pages cannot send; the
  service-worker shim reloads the page on a first visit and breaks module workers in Safari 27; Cloudflare's
  `_headers` sends them for real. Rust's WebAssembly threads still need the nightly compiler.
  [COOP and COEP](https://web.dev/articles/coop-coep),
  [build-std](https://rust-lang.github.io/rust-project-goals/2026/build-std.html).
- **Sound.** Sound scheduled ahead plays on time through a stalled main thread.
  [Audio scheduling](https://web.dev/articles/audio-scheduling).

## The wire

- **Size.** The rooms' snapshots are 3.5 KB raw at the median and 0.35 KB once the WebSocket deflates them; the same
  snapshot in Protocol Buffers is 6 to 10% smaller raw and about 2% smaller deflated. Two thirds of a snapshot's
  bytes are 64-bit numbers: small whole numbers measured from the room shrink the deflated snapshot by about 55 to
  59%, and only what changed by about 88% with them (estimated).
  [Protocol Buffers' encoding](https://protobuf.dev/programming-guides/encoding/),
  [WebSocket compression](https://www.rfc-editor.org/rfc/rfc7692),
  [Valorant's netcode](https://www.riotgames.com/en/news/peeking-valorants-netcode).

## WebTransport

- **Cloudflare.** No Worker, Durable Object or Container accepts a browser's WebTransport: workerd has no QUIC, and
  its maintainers say it is not on the agenda. Inbound UDP to Workers exists only behind an experimental flag.
  [workerd #7130](https://github.com/cloudflare/workerd/pull/7130),
  [workerd #6451](https://github.com/cloudflare/workerd/issues/6451).
- **Elsewhere.** A server with public UDP running `wtransport` or `web-transport-quinn` serves it, with a real
  certificate. [Choosing a package](https://github.com/moq-dev/web-transport/blob/main/PACKAGE-SELECTION.md),
  [Let's Encrypt for addresses](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability).
- **Browsers.** Chrome, Edge and Firefox carry it; Safari 26.4 does, but with open bugs (no datagrams on iOS, a stop
  after 16 MiB). Some networks block UDP outright, so a WebSocket stays for everyone.
  [WebTransport](https://www.w3.org/TR/webtransport/),
  [Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/),
  [blocking QUIC](https://live.paloaltonetworks.com/t5/Management-Articles/How-to-Block-QUIC-Protocol/ta-p/120207).
- **Readiness.** A datagram holds about 1.1 KB; the rooms' snapshots are larger, lean on deflate's ordered history,
  and carry events that must not be lost. Inputs and events need a stream or a resend, and snapshots their deltas,
  before datagrams help.
