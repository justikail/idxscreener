import { Term } from "@/components/Term";
import { isGlossaryKey } from "@/lib/glossary";

/** Label metrik dengan penjelasan dari glosarium; metrik tanpa entri tampil apa adanya. */
export function MetricTooltip({ metric }: { metric: string }) {
  if (!isGlossaryKey(metric)) return <span>{metric}</span>;
  return <Term k={metric} />;
}
