// Shuttle Pop's "How to play" deck (engine/ui/tutorial). More cards join in later tasks.
import type { TutorialCard } from '@forge/ui/tutorial'
import { aimCard } from './aim'
import { settingsCard } from './settings'

export function shuttleTutorial(): TutorialCard[] {
  return [aimCard(), settingsCard()]
}
