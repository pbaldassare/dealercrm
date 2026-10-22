import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "hot" | "bad" | "info" | "muted" | "primary";

const tones: Record<Tone, string> = {
  ok: "bg-success/10 text-success-ink",
  warn: "bg-warning/15 text-warning-ink",
  hot: "bg-danger/15 text-danger-ink",
  bad: "bg-destructive/10 text-destructive-ink",
  info: "bg-info/10 text-info-ink",
  muted: "bg-secondary text-muted-foreground",
  primary: "bg-primary/10 text-primary",
};

export function Pill({ tone = "muted", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn("pill", tones[tone], className)}>{children}</span>;
}
