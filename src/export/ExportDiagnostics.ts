export interface ExportCapabilities {
  readonly video: boolean;
  readonly audio: boolean;
  readonly codec: string | null;
  readonly reason: string | null;
}

const AVC_CANDIDATES = ['avc1.640028', 'avc1.4d0028', 'avc1.42e01f'];
const AUDIO_CONFIG: AudioEncoderConfig = {
  codec: 'mp4a.40.2',
  sampleRate: 48000,
  numberOfChannels: 2,
  bitrate: 192_000,
};

/** Probes WebCodecs for H.264 video and AAC-LC audio at the export resolution. */
export async function checkExportCapabilities(
  width = 1920,
  height = 1080,
  fps = 60,
): Promise<ExportCapabilities> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return { video: false, audio: false, codec: null, reason: 'WebCodecs is unavailable in this browser' };
  }

  let codec: string | null = null;
  for (let i = 0; i < AVC_CANDIDATES.length; i++) {
    const candidate = AVC_CANDIDATES[i]!;
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate, width, height, bitrate: 15_000_000, framerate: fps,
      });
      if (support.supported === true) { codec = candidate; break; }
    } catch {
      // try the next profile
    }
  }

  let audio = false;
  if (typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
    try {
      const support = await AudioEncoder.isConfigSupported(AUDIO_CONFIG);
      audio = support.supported === true;
    } catch {
      audio = false;
    }
  }

  return {
    video: codec !== null,
    audio,
    codec,
    reason: codec === null ? `No H.264 encoder accepts ${width}x${height}@${fps}` : null,
  };
}

// role: export capability probe — WebCodecs presence, H.264 profile and AAC-LC support.
// invariants: audio is only reported when the platform AAC encoder accepts the export config.
// owner milestone: M8
