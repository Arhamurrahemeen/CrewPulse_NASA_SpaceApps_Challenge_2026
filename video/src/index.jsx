import { Composition, registerRoot } from 'remotion'
import { CrewPulseDemo, DURATION, FPS } from './Demo.jsx'

const Root = () => (
  <Composition id="CrewPulseDemo" component={CrewPulseDemo} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
)

registerRoot(Root)
