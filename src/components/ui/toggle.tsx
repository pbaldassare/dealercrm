import { cn } from "@/lib/utils";

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-primary" : "bg-input")}
    >
      <span className={cn("absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
    </button>
  );
}
