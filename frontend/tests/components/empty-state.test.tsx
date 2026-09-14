import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { EmptyState } from '@/components/shared/empty-state';
import { renderWithProviders } from '../test-utils';

describe('EmptyState', () => {
  it('renders the default copy when no title/description is provided', () => {
    renderWithProviders(<EmptyState />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('Once there’s data, it will show up here.')).toBeInTheDocument();
  });

  it('renders provided title, description, and action', () => {
    renderWithProviders(
      <EmptyState title="No generators" description="Assign one to get started." action={<button>Assign</button>} />,
    );
    expect(screen.getByText('No generators')).toBeInTheDocument();
    expect(screen.getByText('Assign one to get started.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
  });
});
