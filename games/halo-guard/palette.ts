// Halo Guard colours. Threats are warm, the shield and core are cool, sparks
// are gold, so what to block and what to let in reads at a glance.
export const C = {
  bg: '#070a1c',
  bgMid: '#10173a',
  core: '#dff8ff',
  shield: '#5ff3ff',
  perfect: '#ffffff',
  bolt: '#ff3d6e',
  heavy: '#ff9a3d',
  feint: '#c13dff',
  spark: '#ffd84d',
  nova: '#7fd4ff',
  heart: '#ff5d7a',
  gold: '#ffd84d',
}

export const KIND_COLOR = { bolt: C.bolt, heavy: C.heavy, feint: C.feint, spark: C.spark } as const
