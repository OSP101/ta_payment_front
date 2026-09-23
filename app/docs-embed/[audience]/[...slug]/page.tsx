import { notFound } from "next/navigation";
import { findPage } from "../../../../content/docs/registry";
import type { Audience } from "../../../../content/docs/types";
import DocArticle from "../../../components/docs/DocArticle";
import { getMe } from "../../../lib/session";
import { canViewAudience } from "../../../lib/docs/audience";

const VALID: Audience[] = ["staff", "lecturer", "ta"];

export default async function EmbedContentPage({
  params,
}: {
  params: Promise<{ audience: string; slug: string[] }>;
}) {
  const { audience: raw, slug: slugParts } = await params;
  if (!VALID.includes(raw as Audience)) notFound();
  const audience = raw as Audience;

  const page = findPage(audience, slugParts.join("/"));
  if (!page) notFound();

  const me = await getMe();
  // The layout shows the notice for these; checked here too so this page
  // never depends on the layout alone to keep content from a reader who
  // may not see it.
  if (!me || !canViewAudience(me, audience)) return null;
  return <DocArticle page={page} audience={audience} me={me} linkBase="/docs-embed" />;
}
