import type { PaginatedResponse } from '@/lib/apiClient';
import type { DataTableQueryParams } from '@/hooks/useDataTableQuery';
import type { GeneratorStatus } from '@/components/shared/status-badge';

export interface MockGenerator {
  id: string;
  code: string;
  kva: number;
  status: GeneratorStatus;
  location: string;
  currentMeter: number;
  installedAt: string; // ISO date
}

const LOCATIONS = ['Site A - Nasr City', 'Site B - 6th of October', 'Site C - New Cairo', 'Workshop - Obour', 'Site D - Maadi'];
const STATUSES: GeneratorStatus[] = ['available', 'rented', 'under_maintenance', 'stopped'];

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

const random = seededRandom(42);

export const MOCK_GENERATORS: MockGenerator[] = Array.from({ length: 87 }, (_, i) => {
  const kva = [50, 100, 150, 200, 250, 350, 500][Math.floor(random() * 7)] ?? 100;
  const daysAgo = Math.floor(random() * 900);
  const installedAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

  return {
    id: `gen-${i + 1}`,
    code: `GEN-${String(i + 1).padStart(3, '0')}`,
    kva,
    status: STATUSES[Math.floor(random() * STATUSES.length)] ?? 'available',
    location: LOCATIONS[Math.floor(random() * LOCATIONS.length)] ?? 'Unknown',
    currentMeter: Math.floor(random() * 20000),
    installedAt,
  };
});

const SORTABLE_FIELDS: Record<string, (row: MockGenerator) => string | number> = {
  code: (row) => row.code,
  kva: (row) => row.kva,
  currentMeter: (row) => row.currentMeter,
  installedAt: (row) => row.installedAt,
};

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/**
 * Stands in for a real `GET /api/generators` call (TASK-008) so this table system can be
 * exercised end-to-end before the backend module exists. Mirrors what `paginateQuery`
 * actually does: filter, sort, then slice.
 */
export async function fetchMockGenerators(
  params: DataTableQueryParams,
  signal: AbortSignal,
  options: { simulateError?: boolean } = {},
): Promise<PaginatedResponse<MockGenerator>> {
  await delay(500, signal);

  if (options.simulateError) {
    throw new Error('Simulated 500 — the generators list failed to load.');
  }

  let rows = MOCK_GENERATORS;

  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter((row) => row.code.toLowerCase().includes(q) || row.location.toLowerCase().includes(q));
  }

  if (params.filters.status) {
    rows = rows.filter((row) => row.status === params.filters.status);
  }

  const from = params.filters.from;
  if (from) {
    rows = rows.filter((row) => row.installedAt >= from);
  }

  const to = params.filters.to;
  if (to) {
    rows = rows.filter((row) => row.installedAt <= to);
  }

  if (params.sort) {
    const desc = params.sort.startsWith('-');
    const field = desc ? params.sort.slice(1) : params.sort;
    const getValue = SORTABLE_FIELDS[field];
    if (getValue) {
      rows = [...rows].sort((a, b) => {
        const av = getValue(a);
        const bv = getValue(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return desc ? -cmp : cmp;
      });
    }
  }

  const total = rows.length;
  const totalPages = Math.max(Math.ceil(total / params.limit), 1);
  const start = (params.page - 1) * params.limit;
  const items = rows.slice(start, start + params.limit);

  return { items, meta: { page: params.page, limit: params.limit, total, totalPages } };
}
