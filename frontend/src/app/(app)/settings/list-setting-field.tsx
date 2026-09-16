'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';

export interface ListSettingFieldProps {
  settingKey: string;
  label: string;
  description?: string;
  value: string[];
  canEdit: boolean;
  onSaved: () => void;
}

/** Section 20 (TASK-030): removing a value already in use on historical records doesn't
 * corrupt them — those records stored the value as a plain-text snapshot at creation, not a
 * live reference, so removing it here only stops it being offered for new entries. */
export function ListSettingField({
  settingKey,
  label,
  description,
  value,
  canEdit,
  onSaved,
}: ListSettingFieldProps) {
  const { t } = useLocale();
  const [items, setItems] = useState(value);
  const [newItem, setNewItem] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function syncFromProps() {
    setItems(value);
    setIsDirty(false);
  }

  useEffect(() => {
    if (!isDirty) setItems(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function addItem() {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    setItems([...items, trimmed]);
    setNewItem('');
    setIsDirty(true);
  }

  function removeItem(item: string) {
    setItems(items.filter((existing) => existing !== item));
    setIsDirty(true);
  }

  async function save() {
    setIsSaving(true);
    try {
      await apiClient.patch(`/api/settings/${settingKey}`, { value: items });
      toast.success(t('settings.saveSuccessToast'));
      setIsDirty(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('settings.saveFailedToast'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="outline" className="gap-1.5">
            {item}
            {canEdit ? (
              <button
                type="button"
                onClick={() => removeItem(item)}
                aria-label={`${t('settings.removeItem')}: ${item}`}
                className="rounded-sm hover:text-destructive"
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </Badge>
        ))}
      </div>

      {canEdit ? (
        <div className="flex items-center gap-2">
          <Input
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addItem();
              }
            }}
            placeholder={t('settings.newItemPlaceholder')}
            disabled={isSaving}
            className="w-56"
          />
          <Button size="sm" variant="outline" onClick={addItem} disabled={isSaving}>
            <Plus className="size-3.5" aria-hidden />
            {t('settings.addItem')}
          </Button>
          {isDirty ? (
            <>
              <Button size="sm" onClick={() => void save()} disabled={isSaving}>
                {t('settings.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={syncFromProps} disabled={isSaving}>
                {t('settings.cancel')}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
