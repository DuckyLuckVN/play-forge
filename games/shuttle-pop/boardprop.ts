// The live score on the little flip scoreboard by the net (the board itself is a prop, props.ts): a
// see-through canvas over its two cards, redrawn only when the score changes. Left card = the local
// player's score, like the HUD board.

import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { BOARD } from './props'

const W = 256
const H = 128
const INK = '#3b2f4a'

export class ScoreCards {
  readonly mesh: Mesh
  private ctx: CanvasRenderingContext2D | null
  private tex: CanvasTexture
  private a = -1
  private b = -1

  constructor() {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    this.ctx = canvas.getContext('2d')
    this.tex = new CanvasTexture(canvas)
    this.tex.colorSpace = SRGBColorSpace
    this.tex.anisotropy = 4
    this.mesh = new Mesh(
      new PlaneGeometry(BOARD.w, BOARD.h),
      new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }),
    )
    // Faces the camera (−z); its left half is the left card on screen.
    this.mesh.rotation.y = Math.PI
    this.mesh.position.set(BOARD.x, BOARD.y, BOARD.face - 0.004)
    this.set(0, 0)
  }

  /** Draw `left`–`right` (no-op when unchanged). */
  set(left: number, right: number) {
    if (left === this.a && right === this.b) return
    this.a = left
    this.b = right
    const c = this.ctx
    if (!c) return
    c.clearRect(0, 0, W, H)
    c.fillStyle = INK
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `800 ${Math.round(H * 0.5)}px system-ui, sans-serif`
    // Card centres (± BOARD.card from the middle) as shares of the canvas width.
    c.fillText(String(left), W * (0.5 - BOARD.card / BOARD.w), H * 0.54)
    c.fillText(String(right), W * (0.5 + BOARD.card / BOARD.w), H * 0.54)
    this.tex.needsUpdate = true
  }
}
