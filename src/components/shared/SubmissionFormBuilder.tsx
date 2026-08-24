import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmissionField } from '@/data/mockData';

/**
 * Admin-facing builder for a dynamic submission form.
 *
 * Extracted from SprintsTab so the Sprint and Hackathon admin flows share one
 * implementation. Produces a SubmissionField[] which the matching renderer
 * (DynamicSubmissionFields) turns into an actual form, and which review UIs
 * join back against to recover human labels for stored customFields keys.
 */

export const SUBMISSION_FIELD_TYPES: { value: SubmissionField['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'radio', label: 'Radio' },
  { value: 'select', label: 'Select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'file', label: 'File' },
];

/** Field types that accept a placeholder hint. */
const PLACEHOLDER_TYPES: SubmissionField['type'][] = ['text', 'textarea', 'select'];

/** Field types that need a caller-supplied option list. */
const OPTION_TYPES: SubmissionField['type'][] = ['radio', 'select'];

/**
 * Generate an opaque, collision-resistant field id. The random suffix matters:
 * two rapid Add Field clicks inside the same millisecond would otherwise
 * produce duplicate ids and React keys.
 */
export function newSubmissionFieldId(): string {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface SubmissionFormBuilderProps {
  fields: SubmissionField[];
  onChange: (fields: SubmissionField[]) => void;
  /** Section heading. Defaults to "Submission Form Configuration". */
  title?: string;
  /** Optional helper text under the heading. */
  description?: string;
  addButtonLabel?: string;
  /** Shown in place of the list when no fields are configured yet. */
  emptyHint?: string;
}

export function SubmissionFormBuilder({
  fields,
  onChange,
  title = 'Submission Form Configuration',
  description,
  addButtonLabel = 'Add Field',
  emptyHint,
}: SubmissionFormBuilderProps) {
  const addField = () => {
    onChange([
      ...fields,
      { id: newSubmissionFieldId(), label: '', type: 'text', placeholder: '', required: false },
    ]);
  };

  const removeField = (id: string) => {
    onChange(fields.filter(f => f.id !== id));
  };

  const updateField = (id: string, updates: Partial<SubmissionField>) => {
    onChange(fields.map(f => (f.id === id ? { ...f, ...updates } : f)));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <div className="space-y-1">
          <Label>{title}</Label>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addField} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          {addButtonLabel}
        </Button>
      </div>

      {fields.length === 0 && emptyHint && (
        <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">
          {emptyHint}
        </p>
      )}

      {fields.map(field => (
        <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-muted/20">
          <div className="flex justify-between gap-2">
            <Input
              className="flex-1"
              value={field.label}
              onChange={e => updateField(field.id, { label: e.target.value })}
              placeholder="Field Label (e.g., Blog URL)"
              aria-label="Field label"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={field.type}
              onChange={e => updateField(field.id, { type: e.target.value as SubmissionField['type'] })}
              aria-label="Field type"
            >
              {SUBMISSION_FIELD_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeField(field.id)}
              aria-label={`Remove field ${field.label || ''}`.trim()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {PLACEHOLDER_TYPES.includes(field.type) && (
            <Input
              value={field.placeholder || ''}
              onChange={e => updateField(field.id, { placeholder: e.target.value })}
              placeholder="Placeholder text (optional)"
              aria-label="Placeholder text"
            />
          )}

          {OPTION_TYPES.includes(field.type) && (
            <div className="space-y-1">
              <Label htmlFor={`options-${field.id}`} className="text-xs text-muted-foreground">
                Options (comma-separated)
              </Label>
              <Input
                id={`options-${field.id}`}
                value={field.optionsRaw !== undefined ? field.optionsRaw : (field.options || []).join(', ')}
                onChange={e => updateField(field.id, {
                  // optionsRaw keeps the in-progress string so typing a comma
                  // doesn't get eaten by the parse-and-rejoin round trip.
                  optionsRaw: e.target.value,
                  options: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                })}
                placeholder="e.g., Option A, Option B, Option C"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`required-${field.id}`}
              className="h-4 w-4 rounded border-gray-300"
              checked={!!field.required}
              onChange={e => updateField(field.id, { required: e.target.checked })}
            />
            <Label htmlFor={`required-${field.id}`} className="text-sm font-normal cursor-pointer">
              Required
            </Label>
          </div>
        </div>
      ))}
    </div>
  );
}
