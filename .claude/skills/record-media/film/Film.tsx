import { loadFont } from '@remotion/fonts';
import { Video } from '@remotion/media';
import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { CAPTION_FADE, FPS, type Lang, shots } from './shots';

const fonts = Promise.all([
  loadFont({ family: 'Public Sans', url: staticFile('fonts/public-sans.woff2'), weight: '400' }),
  loadFont({ family: 'Source Serif 4', url: staticFile('fonts/source-serif-4.woff2'), weight: '400' }),
]);

const Caption = ({ text, frames }: { text: string; frames: number }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, CAPTION_FADE, frames - CAPTION_FADE, frames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        opacity,
        fontFamily: "'Public Sans', 'PingFang SC', sans-serif",
        fontSize: 34,
        color: '#e9e6df',
        textAlign: 'center',
        padding: '0 80px',
      }}
    >
      {text}
    </div>
  );
};

export const Film = ({ lang }: { lang: Lang }) => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    void fonts.then(() => continueRender(handle));
  }, [handle]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#141311' }}>
      {shots[lang].map((shot, index, all) => {
        const frames = Math.round((shot.toSec - shot.fromSec) * FPS);
        const from = all.slice(0, index).reduce((n, s) => n + Math.round((s.toSec - s.fromSec) * FPS), 0);
        return (
          <Sequence key={`${shot.clip}-${from}`} from={from} durationInFrames={frames} layout="none">
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 36 }}>
              <div
                style={{ width: 1760, height: 1100, overflow: 'hidden', borderRadius: 14, border: '1px solid #2f2d29' }}
              >
                <Video
                  src={staticFile(`clips/${shot.clip}`)}
                  trimBefore={Math.round(shot.fromSec * FPS)}
                  trimAfter={Math.round(shot.toSec * FPS)}
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            </AbsoluteFill>
            <AbsoluteFill style={{ justifyContent: 'flex-end', paddingBottom: 26 }}>
              <Caption text={shot.caption} frames={frames} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
