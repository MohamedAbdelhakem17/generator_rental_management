import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { LocaleProvider } from '@/lib/i18n/locale-provider';

export function renderWithProviders(ui: ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}
