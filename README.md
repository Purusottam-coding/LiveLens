# LiveLens

LiveLens is a real-time phone-to-screen streaming app built with React, Vite, WebRTC.

A display opens a 6-digit room, and a phone camera joins that room to broadcast low-latency video and audio.

## Features

- 6-digit room pairing with QR code deep link
- Viewer mode for projector/display screens
- Broadcaster mode for phone camera devices
- WebRTC signaling over Cloudflare Durable Objects WebSocket relay
- Audio SDP optimization for lower-latency Opus streaming
- Video transform controls: rotate, mirror, zoom
- Camera controls: front/back switch, torch, mic mute, quality preset
- Fullscreen viewer mode with playback recovery for mobile autoplay restrictions

## Tech Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS
- Hono (Worker API routing)
- Cloudflare Workers + Durable Objects
- WebRTC (RTCPeerConnection)


## Prerequisites

- Node.js 18+
- npm 9+
- Wrangler CLI (installed via project devDependencies)
- Cloudflare account (for deploy)

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open in browser:

- Home mode selector: `/`
- Viewer mode: `/display`
- Broadcaster mode: `/camera`

### Pairing Flow

1. Open viewer on projector/display (`/display`) and note the 6-digit code.
2. On phone, open broadcaster (`/camera`) or scan the QR shown in viewer.
3. Enter code, pair, then start broadcast.

## Available Scripts

- `npm run dev` - Start Vite dev server
- `npm run build` - Build client for production
- `npm run preview` - Preview production build locally
- `npm run deploy` - Build and deploy Worker + assets via Wrangler

## Worker Endpoints

- `GET /api/health` - Health check
- `GET /api/ice-servers` - ICE/TURN configuration payload
- `GET /api/rooms/:roomCode/check` - Check active viewer presence
- `GET /ws/:roomCode` - WebSocket signaling endpoint

## Deployment

The app is configured with Wrangler using:

- Worker entry: `src/worker/index.ts`
- Static assets directory: `dist/client`
- Durable Object binding: `SIGNALING_ROOM`

Deploy:

```bash
npm run deploy
```

## Important Security Note

The current TURN credentials are committed in source (`src/config/webrtc.ts` and `src/worker/index.ts`).
For production, move these credentials to secure environment configuration and rotate exposed keys.

## Browser Requirements

- HTTPS is required for camera/microphone access outside localhost.
- Modern Chromium, Safari, or Firefox with WebRTC support.
- On iOS/Safari, user interaction may be required to begin unmuted playback.

## Troubleshooting

- If camera fails to start, verify browser camera permission and HTTPS.
- If pairing fails, ensure the viewer is open and the 6-digit code is current.
- If video connects but remains black, tap the viewer overlay to force playback.
- If audio cuts on strict networks, verify TURN relay reachability/firewall rules.
