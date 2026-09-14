import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ErrorState } from '@/components/shared/error-state';
import { renderWithProviders } from '../test-utils';

describe('ErrorState', () => {
  it('renders the default copy and no retry button when onRetry is omitted', () => {
    renderWithProviders(<ErrorState />);
    expect(screen.getByText('Couldn’t load this')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders provided title/description and calls onRetry when clicked', async () => {
    const onRetry = vi.fn();
    renderWithProviders(<ErrorState title="Couldn't load generators" description="Try again." onRetry={onRetry} />);

    expect(screen.getByText("Couldn't load generators")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has an alert role for assistive tech', () => {
    renderWithProviders(<ErrorState />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
