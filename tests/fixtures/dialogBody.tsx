/** The shared Dialog renders into a client-only portal, so server markup of it is empty. This renders the content a
 * dialog component hands to it, so a static test can still assert that content. */
import type { ReactElement, ReactNode } from 'react';
import { Dialog } from '../../src/components/ui/overlay';

export function dialogBody<P>(component: (props: P) => unknown, props: P) {
  return function DialogBody() {
    const dialog = component(props) as ReactElement<{ children: ReactNode }>;
    if (dialog.type !== Dialog) throw new Error('The component does not render the shared Dialog at its root');
    return <>{dialog.props.children}</>;
  };
}
