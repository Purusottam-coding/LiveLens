export const getCameraStream = async (
  facingMode: 'user' | 'environment' = 'environment'
): Promise<MediaStream> => {
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
  };

  return await navigator.mediaDevices.getUserMedia(constraints);
};
