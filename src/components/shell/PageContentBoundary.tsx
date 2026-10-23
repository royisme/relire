/** Contains routed rendering failures inside main; navigation and shared app state stay outside. */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../services/ai/errors';
import { retryFailedLazyImports } from '../../utils/retryableLazy';
import { Button } from '../ui/button';

function PageFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto h-[36rem] max-w-5xl overflow-auto px-4 py-6 sm:px-6">
      <div role="alert" className="space-y-3 break-words text-sm text-bad-700">
        <p>{t('pageFailure.message', { msg: message })}</p>
        <Button variant="outline" onClick={onRetry}>
          {t('pageFailure.retry')}
        </Button>
      </div>
    </div>
  );
}

interface PageContentProps {
  routeKey: string;
  children: ReactNode;
}

interface PageContentState {
  routeKey: string;
  error: { message: string } | null;
}

export class PageContentBoundary extends Component<PageContentProps, PageContentState> {
  state: PageContentState = { routeKey: this.props.routeKey, error: null };

  // Reset failures on navigation without remounting healthy pages (Settings keeps drafts across sections).
  static getDerivedStateFromProps(props: PageContentProps, state: PageContentState) {
    return props.routeKey !== state.routeKey ? { routeKey: props.routeKey, error: null } : null;
  }

  static getDerivedStateFromError(error: unknown) {
    return { error: { message: errorMessage(error) } };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page rendering failed', error, info);
  }

  retry = () => {
    retryFailedLazyImports();
    this.setState({ error: null });
  };

  render() {
    return (
      <main className="flex-1 pb-16">
        {this.state.error ? (
          <PageFailure message={this.state.error.message} onRetry={this.retry} />
        ) : (
          this.props.children
        )}
      </main>
    );
  }
}
