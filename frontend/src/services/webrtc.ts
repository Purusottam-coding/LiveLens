export const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

export const createPeerConnection = (): RTCPeerConnection => {
  return new RTCPeerConnection(rtcConfiguration);
};
