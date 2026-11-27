'use client';

import { useId } from 'react';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  label: string;
  value: string;
  options: FilterOption[];
  onValueChange(value: string): void;
  className?: string;
}

/** DESIGN.md §6 `FilterSelect`: a labelled dropdown that narrows a list. */
export function FilterSelect({ label, value, options, onValueChange, className }: FilterSelectProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Label htmlFor={id} className="t-label-sm text-fg-secondary">
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          {/* The label is passed explicitly so it is in the server HTML, not only after the list mounts. */}
          <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
