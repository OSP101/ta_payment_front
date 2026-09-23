import { redirect } from "next/navigation";
import { getMe } from "../lib/session";
import { defaultAudience } from "../lib/docs/audience";

/**
 * `/docs` has no content of its own — it always sends the reader straight
 * into the manual for the role they spend the most time in
 * (`defaultAudience`), same as clicking the "?" button from inside the app
 * would. Someone who wants a different view uses the switch in the header.
 */
export default async function DocsIndexPage() {
  const me = await getMe();
  if (!me) redirect("/login?next=/docs");
  redirect(`/docs/${defaultAudience(me)}`);
}
