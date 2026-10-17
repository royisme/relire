/** Local image/PDF inputs only: validation, page selection and disposable rendering; no AI or storage. */
import i18n from '../i18n';
import type { ImageInput } from './ai/types';
import type { ImportSource } from './exercises/importDraft';

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_MATERIAL_PAGES = 3;

export function validateMaterialFile(file: Pick<File, 'name' | 'type' | 'size'>): 'pdf' | 'image' {
  const pdf = file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name));
  if (!pdf && !imageTypes.includes(file.type)) throw new Error(i18n.t('importMaterial.fileType'));
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > (pdf ? 20 : 10) * 1024 * 1024)
    throw new Error(i18n.t(pdf ? 'importMaterial.pdfSize' : 'importMaterial.imageSize'));
  return pdf ? 'pdf' : 'image';
}

export function validateImageDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
    throw new Error(i18n.t('importMaterial.imageDecode'));
  if (width * height > 20_000_000) throw new Error(i18n.t('importMaterial.imagePixels'));
}

export function validatePdfPageCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error(i18n.t('importMaterial.pdfPages'));
}

/** Shared by text selection and render: bounded, unique pages in document order. */
export function validateMaterialPages(pages: readonly number[], count: number): number[] {
  const result = [...new Set(pages)].sort((a, b) => a - b);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100 ||
    !result.length ||
    result.length > MAX_MATERIAL_PAGES ||
    result.some((page) => !Number.isInteger(page) || page < 1 || page > count)
  )
    throw new Error(i18n.t('importMaterial.pageBounds'));
  return result;
}

export function parsePageSelection(value: string, count: number): number[] {
  const pages: number[] = [];
  for (const part of value.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(i18n.t('importMaterial.pageFormat'));
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 1 ||
      to < from ||
      to > count ||
      to - from >= MAX_MATERIAL_PAGES
    )
      throw new Error(i18n.t('importMaterial.pageBounds'));
    for (let page = from; page <= to; page++) pages.push(page);
  }
  return validateMaterialPages(pages, count);
}

export function clipboardImage(data: {
  items: ArrayLike<Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'>>;
}): File | null {
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && imageTypes.includes(item.type)) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

export interface ImportMaterial {
  /** pages starts empty; the caller records its reviewed selection in the draft's ImportSource. */
  source: ImportSource;
  pageCount: number;
  /** 1–3 unique pages, returned in document order, ready for extractMaterial (plain base64). */
  render(pages: readonly number[], signal: AbortSignal): Promise<ImageInput[]>;
  /** Idempotent. Cancels outstanding work and releases local data and PDF workers. */
  dispose(): Promise<void>;
}

function readImage(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal.removeEventListener('abort', cancel);
    const cancel = () => {
      reader.abort();
      cleanup();
      reject(new DOMException('', 'AbortError'));
    };
    reader.onload = () => {
      cleanup();
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error(i18n.t('importMaterial.imageRead')));
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error(i18n.t('importMaterial.imageRead')));
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    else reader.readAsDataURL(file);
  });
}

/** The opening signal owns the material lifetime; abort it or await dispose on replacement/unmount. */
export async function openMaterial(file: File, signal: AbortSignal): Promise<ImportMaterial> {
  signal.throwIfAborted();
  const kind = validateMaterialFile(file);
  if (kind === 'pdf') {
    const { openPdfMaterial } = await import('./importPdf').catch(() => {
      signal.throwIfAborted();
      throw new Error(i18n.t('importMaterial.pdfOpen'));
    });
    signal.throwIfAborted();
    return openPdfMaterial(file, signal);
  }
  let data = await readImage(file, signal);
  signal.throwIfAborted();
  const image = document.createElement('img');
  const cancel = () => {
    image.src = '';
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    image.src = data;
    try {
      await image.decode();
    } catch {
      signal.throwIfAborted();
      throw new Error(i18n.t('importMaterial.imageDecode'));
    }
    signal.throwIfAborted();
    validateImageDimensions(image.naturalWidth, image.naturalHeight);
  } finally {
    signal.removeEventListener('abort', cancel);
    image.src = '';
  }
  const mimeType = file.type;
  data = data.slice(data.indexOf(',') + 1);
  let disposed = false;
  const dispose = async () => {
    disposed = true;
    data = '';
    signal.removeEventListener('abort', onAbort);
  };
  const onAbort = () => {
    void dispose();
  };
  signal.addEventListener('abort', onAbort, { once: true });
  return {
    source: { kind, name: file.name || i18n.t('importMaterial.pastedImage'), pages: [] },
    pageCount: 1,
    async render(pages, renderSignal) {
      renderSignal.throwIfAborted();
      signal.throwIfAborted();
      if (disposed) throw new Error(i18n.t('importMaterial.disposed'));
      validateMaterialPages(pages, 1);
      return [{ data, mimeType }];
    },
    dispose,
  };
}
