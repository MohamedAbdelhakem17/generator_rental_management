import type { TranslationKey } from '@/lib/i18n/dictionary';

export type ReportRow = Record<string, unknown>;

export interface ReportColumn {
  key: string;
  labelKey: TranslationKey;
  format?: 'money' | 'date' | 'number' | 'percent';
  align?: 'end';
}

export interface ReportMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ReportListResult {
  items: ReportRow[];
  meta: ReportMeta;
}
