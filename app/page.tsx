"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDevice, homeFor } from "@/lib/client/device";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const d = getDevice();
    router.replace(d ? homeFor(d.mode) : "/setup");
  }, [router]);
  return null;
}
