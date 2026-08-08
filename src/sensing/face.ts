import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision'

const MODEL_URL = new URL('/models/face_landmarker.task', window.location.origin).href

let landmarker: FaceLandmarker | null = null

export async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker
  const fileset = await FilesetResolver.forVisionTasks(new URL('/wasm', window.location.origin).href)
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
  })
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

export async function requestCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
  video.srcObject = stream
  await video.play()
}
