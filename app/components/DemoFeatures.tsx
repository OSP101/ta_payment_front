"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isDemoMode } from "../lib/api";

// Keep the scenario engine/guide dictionary out of ordinary page downloads.
// The wrapper stays mounted so entering/exiting a demo via client navigation
// rechecks sessionStorage just as the original components did.
const DemoBanner = dynamic(() => import("./DemoBanner"), { ssr: false });
const DemoGuidePanel = dynamic(() => import("./DemoGuidePanel"), { ssr: false });

export default function DemoFeatures() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  useEffect(() => { setActive(isDemoMode()); }, [pathname]);
  if (!active) return null;
  return <><DemoBanner /><DemoGuidePanel /></>;
}
