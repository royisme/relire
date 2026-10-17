/** Look up an actual source token, never a guessed word from a whole answer. */
import { readerTokens } from '../../utils/readerTokens';
import { ReaderWord } from '../reader/ReaderWord';

export function MistakeText({ text, onWord }: { text: string; onWord: (word: string, sentence: string) => void }) {
  return (
    <>
      {readerTokens(text).map((token) =>
        token.word ? (
          <ReaderWord
            key={token.start}
            token={token.word}
            activeWord={null}
            layers={{ syllables: false, silent: false, connections: false, stress: false }}
            onClick={(word) => onWord(word, text)}
          />
        ) : (
          <span key={token.start}>{token.text}</span>
        ),
      )}
    </>
  );
}
