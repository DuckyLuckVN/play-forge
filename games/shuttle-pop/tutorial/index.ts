// Shuttle Pop's "How to play" deck (engine/ui/tutorial): the swing, the power shot, aiming, the jump
// smash and the dive, then the settings worth knowing.
import type { TutorialCard } from '@forge/ui/tutorial'
import { aimCard } from './aim'
import { chargeCard } from './charge'
import { diveCard } from './dive'
import { settingsCard } from './settings'
import { smashCard } from './smash'
import { tapCard } from './tap'

export function shuttleTutorial(): TutorialCard[] {
  return [tapCard(), chargeCard(), aimCard(), smashCard(), diveCard(), settingsCard()]
}
