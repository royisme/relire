import { Composition } from 'remotion';
import { Film } from './Film';
import { FPS, framesOf } from './shots';

export const Root = () => (
  <>
    <Composition
      id="Film-en"
      component={Film}
      defaultProps={{ lang: 'en' as const }}
      durationInFrames={framesOf('en')}
      fps={FPS}
      width={1920}
      height={1280}
    />
    <Composition
      id="Film-zh"
      component={Film}
      defaultProps={{ lang: 'zh' as const }}
      durationInFrames={framesOf('zh')}
      fps={FPS}
      width={1920}
      height={1280}
    />
  </>
);
