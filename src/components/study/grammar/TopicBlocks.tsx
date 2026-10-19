/** Draws the topic pack's five block kinds; bilingual prose follows the UI, French stays French. */
import type { GrammarTopic } from '../../../types/grammarTopic';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';

type Block = GrammarTopic['blocks'][number];
type Cell = Extract<Block, { type: 'table' }>['header'][number];

function CellText({ cell, language }: { cell: Cell; language: 'en' | 'zh' }) {
  return (
    <>
      {cell.fr && (
        <span lang="fr" className="font-serif text-base">
          {cell.fr}
        </span>
      )}
      {cell[language] && (
        <span lang={language} className={cell.fr ? 'mt-1 block text-ink-600' : ''}>
          {cell[language]}
        </span>
      )}
    </>
  );
}

export function TopicBlocks({ blocks, language }: { blocks: Block[]; language: 'en' | 'zh' }) {
  return blocks.map((block, index) => (
    <section key={index} className="min-w-0 space-y-3">
      {block.heading && <h3 className="font-serif text-lg font-semibold">{block.heading[language]}</h3>}
      {block.type === 'paragraph' && <p className="whitespace-pre-line">{block.text[language]}</p>}
      {block.type === 'rules' && (
        <ul className="list-disc space-y-2 pl-5">
          {block.items.map((item, i) => (
            <li key={i}>{item[language]}</li>
          ))}
        </ul>
      )}
      {block.type === 'note' && (
        <p className="border-l-2 border-ink-300 pl-4 whitespace-pre-line text-ink-700">{block.text[language]}</p>
      )}
      {block.type === 'examples' && (
        <ul className="space-y-3">
          {block.items.map((item, i) => (
            <li key={i}>
              <p lang="fr" className="font-serif text-lg">
                {item.speaker && `${item.speaker} : `}
                {item.fr}
              </p>
              <p className="text-ink-600">{item[language]}</p>
            </li>
          ))}
        </ul>
      )}
      {block.type === 'table' && (
        <div className="min-w-0 overflow-x-auto rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHeader className="bg-ink-50 text-xs">
              <TableRow>
                {block.header.map((cell, i) => (
                  <TableHead key={i} scope="col">
                    <CellText cell={cell} language={language} />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row, i) => (
                <TableRow key={i}>
                  {row.map((cell, j) =>
                    block.firstColumnIsHeader && j === 0 ? (
                      <TableHead key={j} scope="row">
                        <CellText cell={cell} language={language} />
                      </TableHead>
                    ) : (
                      <TableCell key={j}>
                        <CellText cell={cell} language={language} />
                      </TableCell>
                    ),
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  ));
}
