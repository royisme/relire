/** Local-only note import: permanent controls/preview/result slots, column choice before one durable batch. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type {
  prepareVocabularyImport,
  ImportedNote,
  ImportColumns,
  RejectedNote,
} from '../../services/vocabulary/import/prepare';
import type { PlainTextImport } from '../../services/vocabulary/import/plainText';
import type { ApkgNoteType } from '../../services/vocabulary/import/apkg';
import { importVocabularyNotes } from '../../storage/vocabulary';
import { errorMessage } from '../../services/ai/errors';

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, ImportedNote>();

export function VocabularyImport() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<PlainTextImport | null>(null);
  const [pipeline, setPipeline] = useState<{ prepare: typeof prepareVocabularyImport } | null>(null);
  const [noteTypes, setNoteTypes] = useState<ApkgNoteType[] | null>(null);
  const [noteTypeId, setNoteTypeId] = useState<string | null>(null);
  const [columns, setColumns] = useState<ImportColumns>({ front: 0, back: 1, example: null });
  const [deck, setDeck] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; merged: number; rejected: RejectedNote[] } | null>(null);
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const prepared = useMemo(
    () => (parsed && pipeline ? pipeline.prepare(parsed, columns, deck, language, 0) : null),
    [parsed, pipeline, columns, deck, language],
  );
  const tableColumns = useMemo(
    () =>
      helper.columns([
        helper.accessor('word', { header: t('vocab.import.front') }),
        helper.accessor((note) => (note.context.definition.kind === 'imported' ? note.context.definition.back : ''), {
          id: 'back',
          header: t('vocab.import.back'),
        }),
        helper.accessor((note) => note.context.sentence, { id: 'example', header: t('vocab.import.example') }),
      ]),
    [t],
  );
  const table = useTable({ features, columns: tableColumns, data: prepared?.notes.slice(0, 5) ?? [] });
  const width = noteTypes
    ? (parsed?.headers.columns?.length ?? 0)
    : (parsed?.rows.reduce(
        (width, row) => Math.max(width, row.fields.length),
        Math.max(2, parsed.headers.columns?.length ?? 0),
      ) ?? 2);

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setParsed(null);
    setNoteTypes(null);
    setNoteTypeId(null);
    setResult(null);
    setError(null);
    if (!/\.(txt|tsv|csv|apkg)$/i.test(file.name)) {
      setError(t('vocab.import.fileType'));
      return;
    }
    setBusy(true);
    try {
      const { defaultImportColumns, prepareVocabularyImport } =
        await import('../../services/vocabulary/import/prepare');
      setPipeline({ prepare: prepareVocabularyImport });
      setDeck(file.name.replace(/\.(txt|tsv|csv|apkg)$/i, ''));
      if (/\.apkg$/i.test(file.name)) {
        const { readApkgFile } = await import('../../services/vocabulary/import/apkg');
        setNoteTypes(await readApkgFile(file));
        return;
      }
      const { parsePlainText } = await import('../../services/vocabulary/import/plainText');
      const next = parsePlainText(await file.text());
      setColumns(defaultImportColumns(next));
      setParsed(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!parsed || !prepared || !pipeline || busy || result) return;
    setBusy(true);
    setError(null);
    try {
      const now = Date.now();
      const batch = pipeline.prepare(parsed, columns, deck, language, now);
      const counts = await importVocabularyNotes(batch.notes, now);
      setResult({ ...counts, rejected: batch.rejected });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <Dialog.Trigger render={<Button variant="outline" />}>{t('vocab.import.title')}</Dialog.Trigger>
      <DialogContent>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Dialog.Title className="font-serif text-lg font-semibold">{t('vocab.import.title')}</Dialog.Title>
            <Dialog.Description className="text-sm text-ink-600">{t('vocab.import.description')}</Dialog.Description>
          </div>
          <Dialog.Close render={<Button variant="ghost" disabled={busy} />}>{t('common.close')}</Dialog.Close>
        </div>
        <div className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span>{t('vocab.import.file')}</span>
            <Input
              type="file"
              accept=".txt,.tsv,.csv,.apkg,text/plain,text/tab-separated-values,text/csv"
              disabled={busy}
              onChange={(event) => {
                void chooseFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
          <VocabularyImportNoteTypes
            types={noteTypes}
            value={noteTypeId}
            busy={busy}
            separator={parsed ? t(`vocab.import.separators.${parsed.separator}`) : t('vocab.import.none')}
            onSelect={(type) => {
              setNoteTypeId(String(type.id));
              setParsed(type.parsed);
              setColumns({ front: 0, back: 1, example: null });
              setResult(null);
            }}
          />
          <label className="block space-y-1 text-sm">
            <span>{t('vocab.import.deck')}</span>
            <Input
              value={deck}
              disabled={!parsed || busy || parsed.headers.deckColumn !== undefined}
              onChange={(event) => {
                setDeck(event.target.value);
                setResult(null);
              }}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['front', 'back', 'example'] as const).map((field) => (
              <div key={field} className="min-w-0 space-y-1 text-sm">
                <span id={`import-${field}`}>{t(`vocab.import.${field}`)}</span>
                <Select
                  value={String(columns[field] ?? -1)}
                  disabled={!parsed || busy}
                  onValueChange={(value) => {
                    setColumns({ ...columns, [field]: Number(value) < 0 ? null : Number(value) });
                    setResult(null);
                  }}
                >
                  <SelectTrigger aria-labelledby={`import-${field}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field === 'example' && <SelectItem value="-1">{t('vocab.import.noExample')}</SelectItem>}
                    {Array.from({ length: width }, (_, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {t('vocab.import.column', { number: index + 1, name: parsed?.headers.columns?.[index] ?? '' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <section aria-label={t('vocab.import.preview')} className="space-y-2">
            <h4 className="text-sm font-semibold">{t('vocab.import.preview')}</h4>
            <div className="h-40 overflow-auto rounded-lg border border-ink-200">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id}>
                      {group.headers.map((header) => (
                        <TableHead key={header.id}>
                          <table.FlexRender header={header} />
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getAllCells().map((cell) => (
                        <TableCell key={cell.id} className="max-w-48 whitespace-normal break-words">
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
          <Button
            disabled={!parsed?.rows.length || busy || !!result}
            onClick={() => {
              void save();
            }}
            className="w-full"
          >
            {t(busy ? 'vocab.import.working' : 'vocab.import.action')}
          </Button>
          <VocabularyImportResult
            error={error}
            result={result}
            ready={
              parsed
                ? {
                    rows: parsed.rows.length,
                    accepted: prepared?.notes.length ?? 0,
                    rejected: prepared?.rejected.length ?? 0,
                  }
                : null
            }
          />
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}

export function VocabularyImportNoteTypes({
  types,
  value,
  busy,
  separator,
  onSelect,
}: {
  types: ApkgNoteType[] | null;
  value: string | null;
  busy: boolean;
  separator: string;
  onSelect: (type: ApkgNoteType) => void;
}) {
  const { t } = useTranslation();
  const control = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (types) control.current?.focus();
  }, [types]);
  const items =
    types?.map((type) => ({
      value: String(type.id),
      label: t('vocab.import.apkg.typeOption', {
        name: type.name,
        notes: type.noteCount,
        fields: type.fieldNames.join(', '),
      }),
    })) ?? [];
  return (
    <div className="h-32 space-y-1 overflow-auto text-sm">
      <span id="import-notetype">{t('vocab.import.apkg.noteType')}</span>
      <Select
        items={items}
        value={value}
        disabled={!types || busy}
        onValueChange={(value) => {
          const type = types?.find((type) => String(type.id) === value);
          if (type) onSelect(type);
        }}
      >
        <SelectTrigger ref={control} aria-labelledby="import-notetype">
          <SelectValue placeholder={t('vocab.import.apkg.chooseType')} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="break-words text-ink-600">
        {types ? t('vocab.import.apkg.contentOnly') : t('vocab.import.separator', { separator })}
      </p>
    </div>
  );
}

export function VocabularyImportResult({
  error,
  result,
  ready,
}: {
  error: string | null;
  result: { imported: number; merged: number; rejected: RejectedNote[] } | null;
  ready: { rows: number; accepted: number; rejected: number } | null;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="h-32 overflow-auto break-words text-sm text-ink-700"
    >
      {error ? (
        t('vocab.import.failed', { reason: error })
      ) : result ? (
        <>
          <p>
            {t('vocab.import.result', {
              imported: result.imported,
              merged: result.merged,
              rejected: result.rejected.length,
            })}
          </p>
          <ul>
            {result.rejected.map((note) => (
              <li key={note.row}>{t('vocab.import.rejectedRow', { row: note.row, reason: note.reason })}</li>
            ))}
          </ul>
        </>
      ) : (
        ready && (
          <p>
            {t(ready.rows ? 'vocab.import.ready' : 'vocab.import.empty', {
              accepted: ready.accepted,
              rejected: ready.rejected,
            })}
          </p>
        )
      )}
    </div>
  );
}
