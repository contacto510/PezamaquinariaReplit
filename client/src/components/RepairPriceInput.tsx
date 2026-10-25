import { useState } from "react";
import { Input } from "@/components/ui/input";

export function parseRepairPriceDraft(text: string): number | null {
  const normalized = text.replace(",", ".");
  if (!/^\d*(?:\.\d*)?$/.test(normalized)) return null;
  const value = normalized === "" || normalized === "." ? 0 : Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Keep editing text separate from the numeric value used by totals and saving. */
export default function RepairPriceInput({ value, onChange, label }: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={event => {
        const text = event.target.value;
        const amount = parseRepairPriceDraft(text);
        if (amount === null) return;
        setDraft(text);
        // Keep the parent current even if Save is tapped before a blur event.
        onChange(amount);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={event => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="w-full text-right"
    />
  );
}
