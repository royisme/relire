/** Lazy PDF.js adapter: local rendering and worker lifetime; never imported for image inputs. */
import * as pdfjs from 'pdfjs-dist';
import i18n from '../i18n';
import type { ImageInput } from './ai/types';
import { validateMaterialPages, validatePdfPageCount, type ImportMaterial } from './importMaterial';

export async function openPdfMaterial(file: File, signal: AbortSignal): Promise<ImportMaterial> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    signal.throwIfAborted();
    throw new Error(i18n.t('importMaterial.pdfOpen'));
  }
  signal.throwIfAborted();
  // document.baseURI + Vite's relative base also works when deployed under /app/.
  const assets = new URL('pdfjs/', new URL(import.meta.env.BASE_URL, document.baseURI));
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', assets).href;
  const task = pdfjs.getDocument({
    data: bytes,
    enableXfa: false,
    cMapUrl: new URL('cmaps/', assets).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', assets).href,
    wasmUrl: new URL('wasm/', assets).href,
    iccUrl: new URL('iccs/', assets).href,
    maxImageSize: 20_000_000,
    canvasMaxAreaInBytes: 80_000_000,
    useSystemFonts: false,
  });
  let destruction: Promise<void> | undefined;
  const lifetime = new AbortController();
  const pending = new Set<Promise<ImageInput[]>>();
  const dispose = async () => {
    lifetime.abort();
    signal.removeEventListener('abort', cancel);
    destruction ??= task.destroy();
    await destruction;
    await Promise.allSettled(pending);
  };
  const cancel = () => {
    void dispose().catch(() => {});
  };
  let protectedPdf = false;
  task.onPassword = () => {
    protectedPdf = true;
    cancel();
  };
  signal.addEventListener('abort', cancel, { once: true });
  let doc: pdfjs.PDFDocumentProxy;
  try {
    signal.throwIfAborted();
    doc = await task.promise;
    // Empty-user-password encryption must be rejected too, not only password prompts.
    const { info } = await doc.getMetadata();
    protectedPdf = Boolean((info as { EncryptFilterName?: string | null }).EncryptFilterName);
    if (protectedPdf) throw new Error();
    signal.throwIfAborted();
  } catch {
    await dispose().catch(() => {});
    signal.throwIfAborted();
    throw new Error(i18n.t(protectedPdf ? 'importMaterial.pdfProtected' : 'importMaterial.pdfOpen'));
  }
  try {
    validatePdfPageCount(doc.numPages);
  } catch (error) {
    await dispose();
    throw error;
  }

  async function renderPages(pages: readonly number[], renderSignal: AbortSignal): Promise<ImageInput[]> {
    const activeSignal = AbortSignal.any([signal, renderSignal, lifetime.signal]);
    activeSignal.throwIfAborted();
    const selection = validateMaterialPages(pages, doc.numPages);
    const images: ImageInput[] = [];
    for (const number of selection) {
      let page: pdfjs.PDFPageProxy | undefined;
      const canvas = document.createElement('canvas');
      let rendering: pdfjs.RenderTask | undefined;
      const abort = () => rendering?.cancel();
      activeSignal.addEventListener('abort', abort, { once: true });
      try {
        page = await doc.getPage(number);
        activeSignal.throwIfAborted();
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1600 / Math.max(base.width, base.height)) });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        rendering = page.render({ canvas, viewport });
        if (activeSignal.aborted) rendering.cancel();
        await rendering.promise;
        activeSignal.throwIfAborted();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        images.push({ data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' });
      } catch {
        activeSignal.throwIfAborted();
        throw new Error(i18n.t('importMaterial.pdfRender'));
      } finally {
        activeSignal.removeEventListener('abort', abort);
        canvas.width = 0;
        canvas.height = 0;
        page?.cleanup();
      }
    }
    return images;
  }

  return {
    source: { kind: 'pdf', name: file.name, pages: [] },
    pageCount: doc.numPages,
    render(pages, renderSignal) {
      const operation = renderPages(pages, renderSignal);
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    dispose,
  };
}
