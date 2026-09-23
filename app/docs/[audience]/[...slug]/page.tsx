import { notFound } from "next/navigation";
import { findPage } from "../../../../content/docs/registry";
import type { Audience } from "../../../../content/docs/types";
import DocArticle from "../../../components/docs/DocArticle";
import { getMe } from "../../../lib/session";

const VALID: Audience[] = ["staff", "lecturer", "ta"];

export default async function DocContentPage({
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
  return <DocArticle page={page} audience={audience} me={me} linkBase="/docs" />;
}
