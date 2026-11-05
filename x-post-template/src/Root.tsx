// The video. Its size is set here: 1080 × 1080 (square, for X). For 4:5 use 1080 × 1350, for 16:9 1920 × 1080;
// the keyboard sits at the bottom and the writing fills the space above it, whatever the shape.
import { Composition } from 'remotion';
import { InkDemo, inkDemoSchema } from './InkDemo';
import session from './data/ink-session.json';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="InkDemo"
    component={InkDemo}
    schema={inkDemoSchema}
    defaultProps={{ captions: true }}
    width={1080}
    height={1080}
    fps={30}
    durationInFrames={(session as any).frames.length}
  />
);
