/** Maps the reader's font-size preference to existing text tokens; does not own preference state. */
export function readerFontSizeClass(fontSize: 'sm' | 'base' | 'lg' | 'xl') {
  switch (fontSize) {
    case 'sm':
      return 'text-[17px]';
    case 'base':
      return 'text-[19px]';
    case 'lg':
      return 'text-[21px]';
    case 'xl':
      return 'text-2xl';
  }
}
