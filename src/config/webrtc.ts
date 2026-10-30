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
