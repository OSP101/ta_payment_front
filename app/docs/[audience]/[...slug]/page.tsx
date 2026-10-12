import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPage } from "../../../../content/docs/registry";
import type { Audience } from "../../../../content/docs/types";
import DocArticle from "../../../components/docs/DocArticle";
import { getMe } from "../../../lib/session";
import { canViewAudience } from "../../../lib/docs/audience";
import { getT } from "../../../lib/i18n/server";

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
  const { t, locale } = await getT();
  const page = findPage(raw as Audience, slugParts.join("/"), locale);
  return page ? { title: t("{title} · คู่มือ", { title: page.title }) } : {};
}

export default async function DocContentPage({
  params,
}: {
  params: Promise<{ audience: string; slug: string[] }>;
}) {
  const { audience: raw, slug: slugParts } = await params;
  if (!VALID.includes(raw as Audience)) notFound();
  const audience = raw as Audience;

  const { locale } = await getT();
  const page = findPage(audience, slugParts.join("/"), locale);
  if (!page) notFound();

  const me = await getMe();
  return <DocArticle page={page} audience={audience} me={me} linkBase="/docs" />;
}
