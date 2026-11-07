import { redirect } from "next/navigation";
import BudgetReportPage from "../BudgetReportPage";

export default async function BudgetSummaryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.tab === "transfer_cover") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "tab" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
    }
    const suffix = query.size ? `?${query}` : "";
    redirect(`/staff/transfer-cover${suffix}`);
  }
  return <BudgetReportPage kind="course_summary" />;
}
