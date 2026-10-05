import { Drama } from "lucide-react";
import { APP_NAME } from "@/lib/brand";

export function AppLogo({ size = 200 }: { size?: number }) {
  const icon = Math.max(28, Math.round(size * 0.28));
  const title = Math.max(16, Math.round(size * 0.14));

  return (
    <div
      className="inline-flex flex-col items-center gap-2 select-none"
      style={{ width: size }}
      aria-label={APP_NAME}
    >
      <div
        className="grid place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary"
        style={{ width: icon * 1.6, height: icon * 1.6 }}
      >
        <Drama style={{ width: icon, height: icon }} strokeWidth={1.2} />
      </div>
      <span
        className="font-display tracking-[0.08em] text-gradient-primary uppercase text-center leading-none"
        style={{ fontSize: title }}
      >
        {APP_NAME}
      </span>
    </div>
  );
}
