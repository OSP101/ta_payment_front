import { redirect } from "next/navigation";

// The account screen moved to /account, which now renders inside whichever
// shell the reader belongs to — so a TA and a lecturer see the same page with
// their own sidebar, instead of two copies that can drift apart. Kept as a
// redirect because /ta/profile is what TAs have bookmarked.
export default function TAProfileRedirect() {
  redirect("/account");
}
