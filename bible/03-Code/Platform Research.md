---
type: reference
---
# Platform Research

What the browsers and Cloudflare offer for the game's interface, its threads and its network, as researched on
2026-11-20, and what Electron and Chromium offer the [[Desktop App]], with the sources each
finding rests on. The decisions built on it: [[The Interface Uses No HTML, Now or Later]],
[[Work Leaves the Main Thread Where It Can]], [[The Network Is Made Smaller and Readied for WebTransport]],
[[The Desktop App as Claude Builds It]].

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

## The desktop app

Read in the Chromium of Electron 45 (156, branch `8078`) where a source file is named, and tried in Electron 45.3.0 in
a Linux container with no GPU, Mesa's software Vulkan (llvmpipe) and SwiftShader, where a result is said to be measured.

- **Electron.** 45 runs Chromium 156 and Node 24; a new major comes every 8 weeks, and the newest three are
  supported. Since 45 a sandboxed preload loads only Electron's own modules; since 42 the
  `electron` package downloads its binary on first run, not at install; since 38 an app opens as Wayland's own on a
  Wayland desktop. [Releases](https://releases.electronjs.org/),
  [timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines),
  [breaking changes](https://www.electronjs.org/docs/latest/breaking-changes).
- **WebGPU's API by platform** (`gpu/command_buffer/service/webgpu_decoder_impl.cc`, `CreatePreferredAdapter`):
  Direct3D 12 on Windows, or Direct3D 11 with `--use-webgpu-adapter=d3d11` (which also takes `opengles` and
  `swiftshader`, and no Vulkan); Metal on a Mac; on Linux Vulkan only where Chromium's own drawing is on Vulkan (the
  `Vulkan` feature) or WebGPU reaches it through OpenGL, and no adapter at all otherwise. On Windows WebGPU takes the
  card ANGLE draws on, which `force_high_performance_gpu` sets.
- **Linux.** WebGPU through OpenGL is offered by Wayland's platform alone (`ozone_platform_wayland.cc`), and entry 186
  of Chromium's GPU list (`software_rendering_list.json`) keeps it from every card but Intel's Gen12 and later on Mesa
  22 and NVIDIA's from driver 535.183.01; `--ignore-gpu-blocklist=186` lifts that entry (`service_utils.cc`), and
  entry 186 of the driver-bug list too, which takes the same numbers (`gpu_util.cc`) but has no entry 186.
  Measured: with no switch an X11 desktop gave no adapter; with `Vulkan` Chromium ran its GPU process on Vulkan.
  [What's new in WebGPU 144](https://developer.chrome.com/blog/new-in-webgpu-144),
  [147 and 148](https://developer.chrome.com/blog/new-in-webgpu-147-148).
- **WebGPU's own list** (`webgpu_blocklist_impl.cc`) blocks every CPU adapter and every Direct3D 11 one;
  `--disable-dawn-features=adapter_blocklist` lifts it, and `--enable-unsafe-webgpu` lifts it with SwiftShader and
  WebGPU's unsafe features beside.
- **What the adapter says.** `GPUAdapterInfo` gives `vendor`, `architecture`, the subgroup sizes and
  `isFallbackAdapter` (a CPU adapter); with `--enable-webgpu-developer-features` also `backend`, `type`, `driver`,
  `description` and more. Measured: SwiftShader's adapter is `google`, `swiftshader`, `isFallbackAdapter: true`,
  backend `vulkan`, type `CPU`. `app.getGPUInfo` holds nothing of WebGPU. [WebGPU](https://www.w3.org/TR/webgpu/).
- **Secure contexts.** `navigator.gpu` is only in a secure context. Measured: `about:blank` is none in Electron; a
  scheme registered as secure is one.
- **SwiftShader** cannot present a worker's WebGPU canvas without a GPU's shared images. Measured: the game's device is
  lost about 3 s in, in a bare Electron as in headless Chromium.
- **Updates.** electron-updater replaces a Windows installer's copy, an AppImage, a Debian, RPM or Pacman package and a
  signed Mac app (Squirrel.Mac requires the signature); an unsigned Windows copy updates while its feed names no
  publisher. Block maps let NSIS, a Mac zip and an AppImage download only the changed parts. A generic feed asks for
  one range at a time with `useMultipleRangeRequest: false`.
  [Auto update](https://www.electron.build/v26/docs/features/auto-update/),
  [Electron's autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater).
- **Signing.** An unsigned Windows file shows "Windows protected your PC", and an EV certificate no longer skips
  SmartScreen's reputation; Azure's Artifact Signing costs from $9.99 a month, for an individual only in the US or
  Canada. A Mac app downloaded unsigned opens only from System Settings, Privacy & Security, since macOS Sequoia;
  notarizing needs a Developer ID. [SmartScreen](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation),
  [Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart),
  [Apple](https://developer.apple.com/news/?id=saqachfa).
