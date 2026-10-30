export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // Fast, verified global Google STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },

    // Cloudflare Public STUN
    { urls: 'stun:stun.cloudflare.com:3478' },

    // Metered Verified STUN
    { urls: 'stun:stun.metered.ca:80' },

    // Nextcloud Verified STUN (Port 443 helps through restrictive firewalls)
    { urls: 'stun:stun.nextcloud.com:443' },
  ],
  iceCandidatePoolSize: 10,
};
