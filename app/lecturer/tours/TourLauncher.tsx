"use client";

import TourLauncher from "../../lib/tour/TourLauncher";
import { LECTURER_TOURS } from "./definitions";

/** Lecturer-area wrapper around the shared tour launcher (see app/lib/tour/). */
export default function LecturerTourLauncher() {
  return <TourLauncher tours={LECTURER_TOURS} autoStartKey="lect-home" />;
}
