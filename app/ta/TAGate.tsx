"use client";
import { createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Alert, Button } from "../components/ui";

// TAApprovalContext lets any TA-scoped component (pages, sidebar bell, etc.)
// know whether the current user's profile has been approved. It is provided
// at the layout root so it's available both above and below the shell.
interface Ctx {
  approved: boolean;
  status: string | null;
}
const TAApprovalContext = createContext<Ctx>({ approved: true, status: null });

export function useTAApproval() {
  return useContext(TAApprovalContext);
}

export function TAApprovalProvider({
  approved,
  status,
  children,
}: Ctx & { children: React.ReactNode }) {
  return (
    <TAApprovalContext.Provider value={{ approved, status }}>
      {children}
    </TAApprovalContext.Provider>
  );
}

// LockedActionButton disables its inner button when the TA is not approved.
export function LockedActionButton({
  children,
  disabled,
  ...rest
}: React.ComponentProps<typeof Button>) {
  const { approved } = useTAApproval();
  return (
    <Button {...rest} disabled={disabled || !approved}>
      {children}
    </Button>
  );
}

// Persistent banner shown at the top of every TA page (except the profile
// page and the home course-list, which already communicate this via their
// own UI + the bottom-right OnboardingBlocker).
export function TAApprovalBanner() {
  const { approved, status } = useTAApproval();
  const pathname = usePathname();
  if (approved) return null;
  if (pathname === "/ta/documents" || pathname === "/ta") return null;

  return (
    <div className="mb-4">
      <Alert
        status={status === "rejected" ? "danger" : "warning"}
        icon={<AlertTriangle size={18} />}
        title={
          status === "rejected"
            ? "เอกสารไม่ผ่านการตรวจสอบ — โปรดแก้ไขและส่งใหม่"
            : status === "submitted"
              ? "เอกสารรอเจ้าหน้าที่ตรวจสอบ"
              : "ยังไม่ได้ส่งเอกสาร — เมนูอื่นจะถูกล็อกจนกว่าจะอนุมัติ"
        }
        description="คุณดูเมนูต่าง ๆ ได้ แต่ยังบันทึก/ส่งข้อมูลไม่ได้ จนกว่าเจ้าหน้าที่จะอนุมัติเอกสารในโปรไฟล์"
        action={
          <Link href="/ta/documents">
            <Button variant="primary" size="sm">
              ไปที่เอกสาร <ArrowRight size={14} />
            </Button>
          </Link>
        }
      />
    </div>
  );
}
