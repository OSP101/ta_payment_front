"use client";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "../components/ui";

export default function ForbiddenPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface">
      <div className="w-full max-w-md text-center">
        <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center bg-warning-soft text-warning-soft-foreground">
          <ShieldAlert />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
        <p className="text-sm text-muted mt-2">
          บัญชีของคุณไม่ได้รับสิทธิ์ในการเข้าถึงหน้านี้ กรุณาติดต่อเจ้าหน้าที่วิทยาลัยการคอมพิวเตอร์หากคิดว่าเป็นความผิดพลาด
        </p>
        <div className="mt-6">
          <Button variant="secondary" onPress={() => router.push("/")}>กลับหน้าหลัก</Button>
        </div>
      </div>
    </div>
  );
}
