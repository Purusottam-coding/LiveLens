import { useEffect, useRef, useState, useCallback } from 'react';

export type FacingMode = 'user' | 'environment';
type Quality = 'auto' | '480p' | '720p' | '1080p';

export function isFrontDevice(device: MediaDeviceInfo): boolean {
  const label = (device.label || '').toLowerCase();
  return /front|user|facetime|selfie/i.test(label);
}

export function isBackDevice(device: MediaDeviceInfo): boolean {
  const label = (device.label || '').toLowerCase();
  return /back|rear|environment/i.test(label);
}

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
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number } | null>(null);
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

        if (activeSettings?.deviceId) {
          setActiveDeviceId(activeSettings.deviceId);
        }

        // Detect active facing mode
        if (activeSettings?.facingMode === 'user' || activeSettings?.facingMode === 'environment') {
          setFacingMode(activeSettings.facingMode as FacingMode);
        } else if (activeSettings?.deviceId) {
          const currentDev = vDevices.find((d) => d.deviceId === activeSettings.deviceId);
          if (currentDev) {
            if (isFrontDevice(currentDev)) {
              setFacingMode('user');
            } else if (isBackDevice(currentDev)) {
              setFacingMode('environment');
            }
          }
        }

        // Check torch & zoom support
        const caps = activeTrack.getCapabilities?.() as MediaTrackCapabilities & { 
          torch?: boolean; 
          zoom?: { min: number; max: number; step: number };
        };
        setIsTorchSupported(!!caps?.torch);
        setIsTorchOn(false);

        if (caps?.zoom && typeof caps.zoom.min === 'number' && typeof caps.zoom.max === 'number') {
          setZoomCapabilities(caps.zoom);
        } else {
          setZoomCapabilities(null);
        }
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
    const chosen = devices.find((d) => d.deviceId === deviceId);
    if (chosen) {
      if (isFrontDevice(chosen)) {
        setFacingMode('user');
      } else if (isBackDevice(chosen)) {
        setFacingMode('environment');
      }
    }
  }, [devices]);

  const setCameraFacing = useCallback((targetFacing: FacingMode) => {
    setFacingMode(targetFacing);
    setIsTorchOn(false);

    // Try finding matching device in current enumerated devices
    const isTargetUser = targetFacing === 'user';
    const matchingDevice = devices.find((d) =>
      isTargetUser ? isFrontDevice(d) : isBackDevice(d)
    );

    if (matchingDevice) {
      setSelectedDeviceId(matchingDevice.deviceId);
    } else {
      // Clear selectedDeviceId so getUserMedia requests ideal: targetFacing
      setSelectedDeviceId('');
    }
  }, [devices]);

  const switchCamera = useCallback(() => {
    const nextFacing: FacingMode = facingMode === 'user' ? 'environment' : 'user';
    setCameraFacing(nextFacing);
  }, [facingMode, setCameraFacing]);

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

  const applyHardwareZoom = useCallback(async (zoomValue: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return false;
    try {
      const caps = track.getCapabilities?.() as any;
      if (caps && 'zoom' in caps) {
        await track.applyConstraints({
          advanced: [{ zoom: zoomValue } as any],
        });
        return true;
      }
    } catch (err) {
      console.debug('Hardware zoom constraint not supported or failed', err);
    }
    return false;
  }, []);

  return {
    stream,
    devices,
    selectedDeviceId: selectedDeviceId || activeDeviceId,
    selectCamera,
    setSelectedDeviceId,
    refreshDevices,
    switchCamera,
    facingMode,
    setCameraFacing,
    isTorchOn,
    toggleTorch,
    isTorchSupported,
    zoomCapabilities,
    applyHardwareZoom,
    cameraError,
    currentResolution,
  };
}
