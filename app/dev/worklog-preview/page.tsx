import { notFound } from "next/navigation";
import WorklogPage from "../../ta/courses/[tcId]/worklog/page";

/** Real worklog UI against the isolated development test API. */
export default function WorklogPreview() {
  if (process.env.NODE_ENV !== "development" || process.env.REQUEST_PLAYGROUND !== "1") notFound();
  return <main className="p-4"><WorklogPage params={Promise.resolve({ tcId: "worklog-playground" })} /></main>;
}
