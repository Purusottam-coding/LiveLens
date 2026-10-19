import { useEffect, useRef, useState, useCallback } from 'react';

type FacingMode = 'user' | 'environment';
type Quality = 'auto' | '480p' | '720p' | '1080p';

const QUALITY_CONSTRAINTS: Record<Quality, { width: number; height: number; frameRate: number }> = {
  auto: { width: 1920, height: 1080, frameRate: 60 },
  '480p': { width: 854, height: 480, frameRate: 30 },
  '720p': { width: 1280, height: 720, frameRate: 60 },
  '1080p': { width: 1920, height: 1080, frameRate: 60 },
};

interface UseCameraOptions {
  enabled: boolean;
  quality: Quality;
}

export function useCamera({ enabled, quality }: UseCameraOptions) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [currentResolution, setCurrentResolution] = useState<{
    width: number;
    height: number;
    frameRate?: number;
  } | null>(null);
  const [cameraError, setCameraError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((d) => d.kind === 'videoinput');
      setDevices(videoDevices);
      return videoDevices;
    } catch (err) {
      console.warn('Could not enumerate video devices', err);
      return [];
    }
  }, []);

  // Listen for devices connected/disconnected (e.g. plugging USB camera or opening Iriun)
  useEffect(() => {
    const handleDeviceChange = () => {
      refreshDevices();
    };

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }
    return () => {
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [refreshDevices]);

  useEffect(() => {
    if (!enabled) {
      stopStream();
      setStream(null);
      setCurrentResolution(null);
      return;
    }

    const { width, height, frameRate } = QUALITY_CONSTRAINTS[quality];

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: frameRate },
    };

    if (selectedDeviceId) {
      videoConstraints.deviceId = { exact: selectedDeviceId };
    } else {
      videoConstraints.facingMode = { ideal: facingMode };
    }

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: videoConstraints,
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(async (s) => {
        stopStream();
        streamRef.current = s;
        setStream(s);
        setCameraError('');

        // Get devices after permission is granted to get accurate labels
        const vDevices = await refreshDevices();
        const activeTrack = s.getVideoTracks()[0];
        const activeSettings = activeTrack.getSettings?.();
        
        if (activeSettings?.width && activeSettings?.height) {
          setCurrentResolution({
            width: activeSettings.width,
            height: activeSettings.height,
            frameRate: activeSettings.frameRate ? Math.round(activeSettings.frameRate) : undefined,
          });
        }

        if (activeSettings?.deviceId && !selectedDeviceId) {
          setSelectedDeviceId(activeSettings.deviceId);
        }

        // Check torch support
        const caps = activeTrack.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setIsTorchSupported(!!caps?.torch);
        setIsTorchOn(false);
      })
      .catch((err: Error) => {
        if (err.name === 'NotAllowedError') {
          setCameraError('Camera permission denied. Please allow access in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setCameraError('No camera found on this device.');
        } else {
          setCameraError(`Camera error: ${err.message}`);
        }
      });

    return stopStream;
  }, [enabled, selectedDeviceId, facingMode, quality, refreshDevices, stopStream]);

  const selectCamera = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setIsTorchOn(false);
  }, []);

  const switchCamera = useCallback(() => {
    if (devices.length > 1) {
      const currentIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId);
      const nextIndex = (currentIndex + 1) % devices.length;
      setSelectedDeviceId(devices[nextIndex].deviceId);
    } else {
      setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
      setSelectedDeviceId('');
    }
    setIsTorchOn(false);
  }, [devices, selectedDeviceId]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !isTorchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setIsTorchOn(next);
    } catch {
      // Torch not available or failed silently
    }
  }, [isTorchOn]);

  return {
    stream,
    devices,
    selectedDeviceId,
    selectCamera,
    setSelectedDeviceId,
    refreshDevices,
    switchCamera,
    isTorchOn,
    toggleTorch,
    isTorchSupported,
    cameraError,
    currentResolution,
  };
}
