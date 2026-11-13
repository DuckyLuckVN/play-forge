// Reusable three.js building blocks for 3D games. Import from '@forge/render3d'
// (kept out of '@forge' so 2D games don't bundle three.js).
export { Chunks3D, glowTexture, Particles3D, type Burst3D, type Chunks3DBurst } from './fx'
export { createOverlay2D, type Overlay2D } from './overlay'
export { KeyedPool, type PoolOptions } from './pool'
export { createScene3D, webglAvailable, type ColorGrade, type Scene3D, type Scene3DOptions } from './scene'
export { aoSkips, SceneAoPass, type AoOptions } from './ao'
export {
  bakeGround,
  groundShadeOverlay,
  type BakeArea,
  type GroundBake,
  type GroundBakeOptions,
} from './bake'
export { QUALITY_LEVELS, QualityGovernor, type QualityLevel } from './quality'
