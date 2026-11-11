// Reusable three.js building blocks for 3D games. Import from '@forge/render3d'
// (kept out of '@forge' so 2D games don't bundle three.js).
export { Chunks3D, glowTexture, Particles3D, type Burst3D, type Chunks3DBurst } from './fx'
export { createOverlay2D, type Overlay2D } from './overlay'
export { KeyedPool, type PoolOptions } from './pool'
export { createScene3D, webglAvailable, type Scene3D, type Scene3DOptions } from './scene'
export { QUALITY_LEVELS, QualityGovernor, type QualityLevel } from './quality'
