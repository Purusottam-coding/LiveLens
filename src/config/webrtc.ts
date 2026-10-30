export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // 1. Ultra-fast STUN servers for direct P2P NAT traversal
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.nextcloud.com:443' },

    // 2. Metered Global TURN Relay (UDP) - Solves Symmetric NAT & CGNAT (Mobile Data / 4G / 5G)
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'bcfba4a36f7ba16c407bdd1b',
      credential: 'T+PaXA0t+7FqQyAu',
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'bcfba4a36f7ba16c407bdd1b',
      credential: 'T+PaXA0t+7FqQyAu',
    },

    // 3. Metered Global TURN Relay (TCP & TURNS over TLS) - Bypasses strict corporate & ISP firewalls
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'bcfba4a36f7ba16c407bdd1b',
      credential: 'T+PaXA0t+7FqQyAu',
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'bcfba4a36f7ba16c407bdd1b',
      credential: 'T+PaXA0t+7FqQyAu',
    },
  ],
  iceCandidatePoolSize: 10,
};

/**
 * Optimizes WebRTC SDP for high-fidelity, low-latency, crystal-clear audio:
 * - useinbandfec=1: Enables Forward Error Correction to eliminate cutouts during packet loss.
 * - usedtx=0: Disables discontinuous transmission so voice doesn't clip or gate at speech start.
 * - maxaveragebitrate=96000: High-fidelity 96 kbps audio for studio-like clarity.
 * - stereo=1;sprop-stereo=1: Full spatial audio fidelity.
 * - minptime=10: Ultra-low latency 10ms audio packets (removes audio lag).
 */
export function optimizeOpusSdp(sdp: string): string {
  if (!sdp) return sdp;
  const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!opusMatch) return sdp;
  const pt = opusMatch[1];
  const fmtpRegex = new RegExp(`a=fmtp:${pt}\\s+([^\\r\\n]+)`, 'i');

  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, (_match, params) => {
      let p = params;
      if (!p.includes('useinbandfec=')) p += ';useinbandfec=1';
      if (!p.includes('usedtx=')) p += ';usedtx=0';
      if (!p.includes('maxaveragebitrate=')) p += ';maxaveragebitrate=96000';
      if (!p.includes('stereo=')) p += ';stereo=1';
      if (!p.includes('sprop-stereo=')) p += ';sprop-stereo=1';
      if (!p.includes('minptime=')) p += ';minptime=10';
      return `a=fmtp:${pt} ${p}`;
    });
  } else {
    return sdp.replace(
      new RegExp(`(a=rtpmap:${pt}\\s+opus\/48000[^\\r\\n]*)`, 'i'),
      `$1\r\na=fmtp:${pt} minptime=10;useinbandfec=1;usedtx=0;maxaveragebitrate=96000;stereo=1;sprop-stereo=1`
    );
  }
}
