/** Bounded local thumbnail strip using the sender's render path; owns preview cancellation, not source selection or requests. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { ImportMaterial } from '../../services/importMaterial';
import { Button } from '../ui/button';

interface ThumbnailProps {
  material: ImportMaterial;
  page: number;
  onRemove: (material: ImportMaterial) => void;
  onError: (error: string) => void;
}

function Thumbnail({ material, page, onRemove, onError }: ThumbnailProps) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ material: ImportMaterial; page: number; url: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void material.render([page], controller.signal).then(
      ([image]) => {
        // Base64 already belongs to the material renderer; no extra Blob or object URL needs a lifetime.
        if (!controller.signal.aborted)
          setPreview({ material, page, url: `data:${image.mimeType};base64,${image.data}` });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) onError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => controller.abort();
  }, [material, page, onError]);
  const label = t('importFlow.previewPage', { page, name: material.source.name });
  const remove = t('importFlow.removeImage', { name: material.source.name });
  return (
    <figure className="w-24 min-w-0 shrink-0">
      <div className="relative w-24 h-24 border border-ink-200 bg-ink-100">
        {preview?.material === material && preview.page === page && (
          <img src={preview.url} alt={label} className="w-full h-full object-contain" />
        )}
        {material.source.kind === 'image' && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute top-0 right-0"
            aria-label={remove}
            title={remove}
            onClick={() => onRemove(material)}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        )}
      </div>
      <figcaption className="h-10 overflow-auto text-xs break-words">
        {material.source.kind === 'pdf' ? label : material.source.name}
      </figcaption>
    </figure>
  );
}

export function SourceThumbnails({
  materials,
  pages,
  onRemove,
  onError,
}: {
  materials: ImportMaterial[];
  pages: number[];
  onRemove: ThumbnailProps['onRemove'];
  onError: ThumbnailProps['onError'];
}) {
  const { t } = useTranslation();
  return (
    <div
      className="h-72 sm:h-36 overflow-auto flex flex-wrap content-start items-start gap-2 min-w-0"
      aria-label={t('importFlow.previews')}
    >
      {materials.flatMap((material, index) =>
        (material.source.kind === 'pdf' ? pages : [1]).map((page) => (
          <Thumbnail key={`${index}-${page}`} material={material} page={page} onRemove={onRemove} onError={onError} />
        )),
      )}
    </div>
  );
}
