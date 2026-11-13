import type { Point2D, Point3D } from './types'

function angleFromVectors(dot: number, magnitudeA: number, magnitudeB: number): number | null {
  if (!Number.isFinite(dot) || magnitudeA === 0 || magnitudeB === 0) return null
  const cosine = Math.max(-1, Math.min(1, dot / (magnitudeA * magnitudeB)))
  return Math.acos(cosine) * 180 / Math.PI
}

/** Image-plane angle ABC. Coordinates should be aspect-correct pixel coordinates. */
export function calculateAngleABC2D(a: Point2D, b: Point2D, c: Point2D): number | null {
  const bax = a.x - b.x
  const bay = a.y - b.y
  const bcx = c.x - b.x
  const bcy = c.y - b.y
  return angleFromVectors(bax * bcx + bay * bcy, Math.hypot(bax, bay), Math.hypot(bcx, bcy))
}

/** 3D angle ABC for world-space coordinates (MediaPipe world landmarks are in meters). */
export function calculateAngleABC3D(a: Point3D, b: Point3D, c: Point3D): number | null {
  const bax = a.x - b.x
  const bay = a.y - b.y
  const baz = a.z - b.z
  const bcx = c.x - b.x
  const bcy = c.y - b.y
  const bcz = c.z - b.z
  return angleFromVectors(bax * bcx + bay * bcy + baz * bcz, Math.hypot(bax, bay, baz), Math.hypot(bcx, bcy, bcz))
}
