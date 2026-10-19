# LiveLens - Backend 🚀

Signaling and session server for LiveLens using Node.js, Express, Socket.io, and TypeScript.

## 🚀 Features
- **Session Controller:** REST API endpoints to generate & query streaming sessions
- **Pairing Service:** 6-digit numeric pairing code management
- **Signaling Socket:** Socket.io relay for WebRTC SDP offers/answers and ICE candidates
- **Rate Limiter:** IP-based request throttling middleware

## 🛠️ Tech Stack
- **Runtime:** Node.js (v20+)
- **Framework:** Express & Socket.io
- **Language:** TypeScript

## 📦 Setup & Development
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Run development server
npm run dev
```
