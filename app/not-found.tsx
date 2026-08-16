"use client";
import { useRouter } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { Button } from "./components/ui";

export default function NotFound() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface">
      <div className="w-full max-w-md text-center">
        <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center bg-warning-soft text-warning-soft-foreground">
          <FileQuestion />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">ไม่พบหน้าที่คุณต้องการ</h1>
        <p className="text-sm text-muted mt-2">
          ลิงก์นี้อาจไม่ถูกต้องหรือหน้าดังกล่าวถูกย้ายไปแล้ว
        </p>
        <div className="mt-6">
          <Button variant="secondary" onPress={() => router.push("/")}>กลับหน้าหลัก</Button>
        </div>
      </div>
    </div>
  );
}
