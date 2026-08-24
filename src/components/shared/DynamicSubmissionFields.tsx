import { Upload, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SubmissionField } from '@/data/mockData';

/**
 * Renderer for an admin-built dynamic submission form.
 *
 * Deliberately generic: every value lands in a flat `values` record keyed by
 * SubmissionField.id, and files land in a parallel `files` record. Unlike the
 * Sprint submit form this has no reserved/magic field ids, so a hackathon form
 * is entirely described by its SubmissionField[] with no hidden coupling.
 */

interface DynamicSubmissionFieldsProps {
  fields: SubmissionField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  /** Selected files per field id. Required if any field has type 'file'. */
  files?: Record<string, File[]>;
  onFilesChange?: (fieldId: string, files: File[]) => void;
  disabled?: boolean;
  /** Prefix for DOM ids, to keep them unique if two forms render at once. */
  idPrefix?: string;
}

/**
 * Validate required fields. Returns the first human-readable error, or null.
 *
 * `false` is treated as a legitimate answer for checkboxes, matching the
 * existing Sprint form behaviour (`!value && value !== false`).
 */
export function validateSubmissionFields(
  fields: SubmissionField[],
  values: Record<string, unknown>,
  files: Record<string, File[]> = {},
): string | null {
  for (const field of fields) {
    if (!field.required) continue;

    const value = field.type === 'file'
      ? (files[field.id]?.length ?? 0) > 0
      : values[field.id];

    if (!value && value !== false) {
      return `Please fill in the required field: ${field.label}`;
    }
  }
  return null;
}

export function DynamicSubmissionFields({
  fields,
  values,
  onChange,
  files = {},
  onFilesChange,
  disabled = false,
  idPrefix = 'field',
}: DynamicSubmissionFieldsProps) {
  const setValue = (id: string, value: unknown) => {
    onChange({ ...values, [id]: value });
  };

  const domId = (fieldId: string) => `${idPrefix}-${fieldId}`;

  const handleFileChange = (fieldId: string, incoming: FileList | null) => {
    if (!incoming || !onFilesChange) return;
    onFilesChange(fieldId, [...(files[fieldId] || []), ...Array.from(incoming)]);
  };

  const removeFile = (fieldId: string, index: number) => {
    if (!onFilesChange) return;
    onFilesChange(fieldId, (files[fieldId] || []).filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {fields.map(field => {
        const id = domId(field.id);
        const value = values[field.id];

        return (
          <div key={field.id} className="space-y-3">
            <Label htmlFor={id}>
              {field.label}
              {field.required
                ? <span className="text-destructive ml-1">*</span>
                : <span className="text-muted-foreground text-xs ml-1">(Optional)</span>}
            </Label>

            {field.type === 'text' && (
              <Input
                id={id}
                placeholder={field.placeholder}
                value={(value as string) ?? ''}
                onChange={e => setValue(field.id, e.target.value)}
                disabled={disabled}
                required={field.required}
              />
            )}

            {field.type === 'textarea' && (
              <Textarea
                id={id}
                placeholder={field.placeholder}
                value={(value as string) ?? ''}
                onChange={e => setValue(field.id, e.target.value)}
                disabled={disabled}
                required={field.required}
                rows={4}
              />
            )}

            {field.type === 'radio' && field.options && (
              <RadioGroup
                value={(value as string) ?? ''}
                onValueChange={v => setValue(field.id, v)}
                disabled={disabled}
                className="flex flex-wrap items-center gap-6"
              >
                {field.options.map(option => (
                  <div key={option} className="flex items-center space-x-2">
                    <RadioGroupItem value={option} id={`${id}-${option}`} />
                    <Label htmlFor={`${id}-${option}`} className="font-normal cursor-pointer">
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {field.type === 'select' && field.options && (
              <select
                id={id}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={(value as string) ?? ''}
                onChange={e => setValue(field.id, e.target.value)}
                disabled={disabled}
                required={field.required}
              >
                <option value="" disabled>{field.placeholder || 'Select an option'}</option>
                {field.options.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            )}

            {field.type === 'checkbox' && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={id}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={!!value}
                  onChange={e => setValue(field.id, e.target.checked)}
                  disabled={disabled}
                />
                <Label htmlFor={id} className="font-normal cursor-pointer">
                  {field.placeholder || field.label}
                </Label>
              </div>
            )}

            {field.type === 'file' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    id={id}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => handleFileChange(field.id, e.target.files)}
                    disabled={disabled}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={disabled}
                    onClick={() => document.getElementById(id)?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Upload Files
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {field.placeholder || 'Screenshots, diagrams, or other supporting materials'}
                  </span>
                </div>

                {(files[field.id]?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    {files[field.id].map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={disabled}
                          onClick={() => removeFile(field.id, index)}
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
