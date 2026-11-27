import { notFound } from "next/navigation";
import TACoursePage from "../../ta/courses/[tcId]/page";

export default function TACoursePreview() {
  if (process.env.NODE_ENV !== "development" || process.env.REQUEST_PLAYGROUND !== "1") notFound();
  return <main className="p-4"><TACoursePage params={Promise.resolve({ tcId: "course-playground" })} /></main>;
}
