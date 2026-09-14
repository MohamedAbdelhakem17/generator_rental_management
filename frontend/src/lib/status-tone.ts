/**
 * The 4 status colors (globals.css) as reusable semantic tones, so any module's status
 * enum (Generator, Contract, Extract, Maintenance, ...) can borrow them by meaning
 * ("success"/"warning"/...) without re-deriving the color logic StatusBadge already owns.
 */
export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export interface StatusToneClasses {
  bg: string;
  fg: string;
  border: string;
  dot: string;
}

export const STATUS_TONE_CLASSES: Record<StatusTone, StatusToneClasses> = {
  success: {
    bg: 'bg-status-available-bg',
    fg: 'text-status-available-fg',
    border: 'border-status-available-border',
    dot: 'bg-status-available-fg',
  },
  info: {
    bg: 'bg-status-rented-bg',
    fg: 'text-status-rented-fg',
    border: 'border-status-rented-border',
    dot: 'bg-status-rented-fg',
  },
  warning: {
    bg: 'bg-status-maintenance-bg',
    fg: 'text-status-maintenance-fg',
    border: 'border-status-maintenance-border',
    dot: 'bg-status-maintenance-fg',
  },
  danger: {
    bg: 'bg-status-stopped-bg',
    fg: 'text-status-stopped-fg',
    border: 'border-status-stopped-border',
    dot: 'bg-status-stopped-fg',
  },
  neutral: {
    bg: 'bg-muted',
    fg: 'text-muted-foreground',
    border: 'border-border',
    dot: 'bg-muted-foreground',
  },
};
