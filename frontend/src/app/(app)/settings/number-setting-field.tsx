'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';

export interface NumberSettingFieldProps {
  settingKey: string;
  label: string;
  description?: string;
  notice?: string;
  value: number;
  canEdit: boolean;
  onSaved: () => void;
}

/** A single row in the Settings page: label + current value, switching to an inline
 * number input + Save/Cancel when the actor has permission to edit it (Section 17). */
export function NumberSettingField({
  settingKey,
  label,
  description,
  notice,
  value,
  canEdit,
  onSaved,
}: NumberSettingFieldProps) {
  const { t } = useLocale();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [isSaving, setIsSaving] = useState(false);

  function startEditing() {
    setDraft(String(value));
    setIsEditing(true);
  }

  async function save() {
    setIsSaving(true);
    try {
      await apiClient.patch(`/api/settings/${settingKey}`, { value: Number(draft) });
      toast.success(t('settings.saveSuccessToast'));
      setIsEditing(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('settings.saveFailedToast'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-2 sm:w-64 sm:shrink-0">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={isSaving}
              className="w-32"
            />
            <Button size="sm" onClick={() => void save()} disabled={isSaving}>
              {t('settings.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} disabled={isSaving}>
              {t('settings.cancel')}
            </Button>
          </div>
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
        </div>
      ) : (
        <div className="flex items-center gap-3 sm:shrink-0">
          <span className="tabular-data text-sm text-foreground">{value}</span>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={startEditing}>
              <Pencil className="size-3.5" aria-hidden />
              {t('settings.edit')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
