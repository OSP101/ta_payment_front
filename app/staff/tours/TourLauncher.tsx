"use client";

import TourLauncher from "../../lib/tour/TourLauncher";
import { STAFF_TOURS } from "./definitions";

/** Staff-area wrapper around the shared tour launcher (see app/lib/tour/). */
export default function StaffTourLauncher() {
  return (
    <TourLauncher
      tours={STAFF_TOURS}
      autoStartKey="dashboard"
      // Staff shipped before the launcher was shared; keep the old prefix so
      // officers who already dismissed tours don't get re-pulsed.
      seenPrefix="ta-payment:staff-tour-seen:"
    />
  );
}
