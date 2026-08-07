"use client";

import TourLauncher from "../../lib/tour/TourLauncher";
import { TA_TOURS } from "./definitions";

/** TA-area wrapper around the shared tour launcher (see app/lib/tour/). */
export default function TaTourLauncher() {
  return <TourLauncher tours={TA_TOURS} autoStartKey="ta-home" />;
}
