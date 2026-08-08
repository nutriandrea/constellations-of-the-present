import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { BlendshapeMap } from './expression'

const MODEL_URL = new URL('/models/face_landmarker.task', window.location.origin).href

let landmarker: FaceLandmarker | null = null

function landmarkerOptions(delegate: 'GPU' | 'CPU') {
  return {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
  }
}

export async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker
  const fileset = await FilesetResolver.forVisionTasks(new URL('/wasm', window.location.origin).href)
  try {
    landmarker = await FaceLandmarker.createFromOptions(fileset, landmarkerOptions('GPU'))
  } catch {
    // Alcuni device (soprattutto GPU integrate) rifiutano WebGL2 o il modello:
    // ripieghiamo sulla CPU prima di rinunciare.
    landmarker = await FaceLandmarker.createFromOptions(fileset, landmarkerOptions('CPU'))
  }
  return landmarker
}

export function detectFace(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestamp: number,
): FaceLandmarkerResult | null {
  if (video.readyState < 2) return null
  try {
    return landmarker.detectForVideo(video, timestamp)
  } catch {
    return null
  }
}

export function landmarksFromResult(result: FaceLandmarkerResult | null): number[][] | null {
  if (!result || result.faceLandmarks.length === 0) return null
  const mesh = result.faceLandmarks[0]
  return Array.from({ length: mesh.length }, (_, i) => [mesh[i].x, mesh[i].y, mesh[i].z])
}

/** Mappa nome blendshape -> score (0..1) dal primo volto rilevato. */
export function blendshapesFromResult(result: FaceLandmarkerResult | null): BlendshapeMap | null {
  if (!result || result.faceBlendshapes.length === 0) return null
  const map: BlendshapeMap = {}
  for (const category of result.faceBlendshapes[0].categories) {
    map[category.categoryName] = category.score
  }
  return map
}

export async function requestCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
  video.srcObject = stream
  await video.play()
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject
  if (stream instanceof MediaStream) {
    stream.getTracks().forEach((track) => track.stop())
  }
  video.srcObject = null
}
