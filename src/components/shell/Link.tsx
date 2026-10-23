/** An in-app link: a real anchor (shareable, opens in a new tab) that navigates without reloading. */
import * as React from 'react';
import { navigate } from '../../hooks/useRoute';
import { routeHref, type Route } from '../../utils/routes';

interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Route;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(({ to, onClick, ...props }, ref) => (
  <a
    ref={ref}
    href={routeHref(to)}
    onClick={(event) => {
      onClick?.(event);
      // Let the browser handle modified clicks (new tab, new window, download).
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      navigate(to);
    }}
    {...props}
  />
));
Link.displayName = 'Link';
