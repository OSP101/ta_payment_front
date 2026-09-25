import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPage } from "../../../../content/docs/registry";
import type { Audience } from "../../../../content/docs/types";
import DocArticle from "../../../components/docs/DocArticle";
import { getMe } from "../../../lib/session";
import { canViewAudience } from "../../../lib/docs/audience";

const VALID: Audience[] = ["staff", "lecturer", "ta"];

// The layout's audience gate does not cover metadata, so the same check runs
// here: a page title is manual content too, and must not name a staff page to
// someone the layout is about to bounce.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ audience: string; slug: string[] }>;
}): Promise<Metadata> {
  const { audience: raw, slug: slugParts } = await params;
  if (!VALID.includes(raw as Audience)) return {};
  const me = await getMe();
  if (!me || !canViewAudience(me, raw as Audience)) return {};
  const page = findPage(raw as Audience, slugParts.join("/"));
  return page ? { title: `${page.title} · คู่มือ` } : {};
}

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
