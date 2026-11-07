// The video. Its size is set here: 1080 × 1080 (square, for X). For 4:5 use 1080 × 1350, for 16:9 1920 × 1080;
// the keyboard sits at the bottom and the writing fills the space above it, whatever the shape.
import { Composition } from 'remotion';
import { InkDemo, inkDemoSchema } from './InkDemo';
import { HandLab, handLabSchema } from './HandLab';
import { TakeHands, takeHandsMetadata, takeHandsSchema } from './TakeHands';
import session from './data/ink-session.json';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="InkDemo"
      component={InkDemo}
      schema={inkDemoSchema}
      defaultProps={{ captions: true, hands: false, handLook: 'ghost' }}
      width={1080}
      height={1080}
      fps={30}
      durationInFrames={(session as any).frames.length}
    />
    {/* the same video with two ghost hands typing it (record their motion with npm run hands) */}
    <Composition
      id="InkDemoHands"
      component={InkDemo}
      schema={inkDemoSchema}
      defaultProps={{ captions: true, hands: true, handLook: 'ghost' }}
      width={1080}
      height={1080}
      fps={30}
      durationInFrames={(session as any).frames.length}
    />
    {/* a recorded take (recorder/, npm run take): his face, his hands, then the ghost hands copying them */}
    <Composition id="TakeHands" component={TakeHands as any} schema={takeHandsSchema} defaultProps={{ handLook: 'ghost' as const, handLines: true }} calculateMetadata={takeHandsMetadata as any} width={1080} height={1080} fps={30} durationInFrames={30} />
    {/* the ghost hands on their own, one still: their shape ('clay') or their glass ('ghost') */}
    <Composition id="HandLab" component={HandLab} schema={handLabSchema} defaultProps={{ moment: 'rest', look: 'clay', scale: 0.75 }} width={1080} height={1080} fps={30} durationInFrames={1} />
  </>
);
