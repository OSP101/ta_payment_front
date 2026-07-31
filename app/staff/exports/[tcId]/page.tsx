import { redirect } from "next/navigation";

// The per-course workspace moved under the merged payout screen so review and
// export sit on one page instead of two tabs of two menus.
export default async function LegacyCourseWorkspace({
  params,
}: {
  params: Promise<{ tcId: string }>;
}) {
  const { tcId } = await params;
  redirect(`/staff/payouts/${tcId}`);
}
