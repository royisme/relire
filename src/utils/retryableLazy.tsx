/** Keeps lazy imports cached until an explicit page retry replaces only rejected React.lazy instances. */
import { lazy, type ComponentType } from 'react';

const failedImports = new Set<() => void>();

export function retryFailedLazyImports() {
  for (const reset of failedImports) reset();
  failedImports.clear();
}

export function retryableLazy<Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>) {
  const createLazy = () =>
    lazy(() =>
      load().catch((error: unknown) => {
        failedImports.add(reset);
        throw error;
      }),
    );
  let Current = createLazy();
  const reset = () => {
    Current = createLazy();
  };
  return function RetryableLazy(props: Props) {
    return <Current {...props} />;
  };
}
