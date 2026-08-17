"use client";
import { useState } from "react";
import { mutate } from "swr";
import { Modal as HModal, Checkbox, Button as HButton } from "@heroui/react";
import { ShieldCheck } from "lucide-react";
import { errMessage, pdpaConsent } from "../lib/api";
import { notify } from "../lib/notify";

/**
 * Shown in place of the TA profile form (Step 1 of "เอกสารของฉัน") the first
 * time someone with no pdpa_consented_at reaches it — new TAs, and anyone who
 * used the form before this notice existed. Not built on the shared `Modal`
 * in ./ui: that wrapper always renders a close button and dismisses on
 * backdrop click, and this one deliberately cannot be dismissed any way
 * other than reading it and clicking accept — see isDismissable /
 * isKeyboardDismissDisabled below.
 */
export default function PdpaConsentModal({ onAccepted }: { onAccepted: () => void }) {
  const [ack, setAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function accept() {
    setSubmitting(true);
    try {
      await pdpaConsent();
      await mutate("/me");
      onAccepted();
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HModal>
      <HModal.Backdrop isOpen isDismissable={false} isKeyboardDismissDisabled>
        <HModal.Container>
          <HModal.Dialog className="sm:max-w-xl">
            <HModal.Header>
              <HModal.Icon className="bg-accent-soft text-accent-soft-foreground">
                <ShieldCheck className="size-5" />
              </HModal.Icon>
              <HModal.Heading>ประกาศเกี่ยวกับการเก็บรวบรวมและใช้ข้อมูลส่วนบุคคล</HModal.Heading>
              <p className="text-sm leading-5 text-muted">
                ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) — โปรดอ่านก่อนกรอกข้อมูล
              </p>
            </HModal.Header>
            <HModal.Body>
              <div className="max-h-80 overflow-y-auto pr-1 text-sm leading-6 text-foreground space-y-4">
                <p>
                  ก่อนกรอกข้อมูลในขั้นตอนนี้ ระบบ COCO TAS ขอแจ้งให้ท่านทราบและขอความยินยอมในการเก็บรวบรวม
                  ใช้ และเปิดเผยข้อมูลส่วนบุคคลของท่าน ดังนี้
                </p>
                <div>
                  <p className="font-semibold">1. ข้อมูลที่จัดเก็บ</p>
                  <p>
                    เลขบัตรประชาชน 13 หลัก (จัดเก็บในระบบแบบเข้ารหัส) รหัสนักศึกษา เบอร์โทรศัพท์
                    ชื่อ-นามสกุล คำนำหน้าชื่อ ส่วนข้อมูลบัญชีธนาคาร/พร้อมเพย์และลายมือชื่อ ระบบจะใช้เพื่อสร้าง
                    แบบแจ้งเจ้าหนี้เท่านั้น โดย<strong>ไม่บันทึกลงฐานข้อมูล</strong>ของระบบ
                  </p>
                </div>
                <div>
                  <p className="font-semibold">2. วัตถุประสงค์การเก็บและใช้ข้อมูล</p>
                  <p>
                    เพื่อจัดทำแบบแจ้งข้อมูลเจ้าหนี้ ให้เจ้าหน้าที่ตรวจสอบและส่งต่อให้ฝ่ายการเงินของมหาวิทยาลัย
                    สำหรับบันทึกเข้าสู่ระบบ ERP ของมหาวิทยาลัย เพื่อดำเนินการโอนเงินค่าตอบแทนให้ท่านผ่านบัญชี
                    พร้อมเพย์ที่ผูกกับเลขบัตรประชาชนของท่าน ระบบจะไม่นำข้อมูลนี้ไปใช้เพื่อวัตถุประสงค์อื่นโดยไม่ได้
                    รับความยินยอมเพิ่มเติม
                  </p>
                </div>
                <div>
                  <p className="font-semibold">3. มาตรการรักษาความปลอดภัย</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      เลขบัตรประชาชนที่จัดเก็บถูกเข้ารหัสด้วยมาตรฐาน XChaCha20-Poly1305 แยกกุญแจเข้ารหัส
                      เฉพาะ ไม่ปะปนกับข้อมูลอื่น
                    </li>
                    <li>
                      บัญชีเจ้าหน้าที่/ผู้ดูแลระบบที่มีสิทธิ์เข้าถึงข้อมูลของท่านต้องยืนยันตัวตนสองชั้น
                      (Two-Factor Authentication)
                    </li>
                    <li>
                      การเข้าถึงข้อมูลที่เข้ารหัสของท่านทุกครั้ง (เช่น การเรียกดูเลขบัตรประชาชนของท่าน)
                      จะถูกบันทึกเป็นหลักฐาน (audit log) ระบุตัวผู้เข้าถึง วันเวลา และเหตุผล
                      ซึ่งสามารถตรวจสอบย้อนหลังได้
                    </li>
                    <li>
                      ระบบจำกัดสิทธิ์การเข้าถึงตามบทบาทหน้าที่ (Role-based Access Control)
                      เฉพาะเจ้าหน้าที่ที่เกี่ยวข้องกับการดำเนินการเบิกจ่ายเท่านั้นที่เข้าถึงข้อมูลนี้ได้
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold">4. สิทธิของเจ้าของข้อมูล</p>
                  <p>
                    ท่านมีสิทธิ์ขอเข้าถึง ขอแก้ไข ขอให้ลบ หรือถอนความยินยอมการเก็บข้อมูลนี้ได้ทุกเมื่อ
                    โดยติดต่อเจ้าหน้าที่ผู้ดูแลระบบ ทั้งนี้การถอนความยินยอมอาจทำให้ไม่สามารถดำเนินการเบิกจ่าย
                    ค่าตอบแทนให้ท่านได้จนกว่าจะดำเนินการให้ความยินยอมใหม่
                  </p>
                </div>
                <div>
                  <p className="font-semibold">5. การบันทึกความยินยอม</p>
                  <p>
                    เมื่อท่านกด &quot;ยอมรับ&quot; ระบบจะบันทึกวันเวลาและอุปกรณ์/เครือข่ายที่ท่านใช้ยืนยันความ
                    ยินยอมไว้เป็นหลักฐาน เพื่อยืนยันว่าท่านได้อ่าน เข้าใจ และให้ความยินยอมโดยสมัครใจก่อนกรอก
                    ข้อมูลจริง
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
                <Checkbox isSelected={ack} onChange={setAck}>
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    ข้าพเจ้าได้อ่านและเข้าใจข้อความข้างต้น และยินยอมให้เก็บรวบรวมข้อมูลตามที่ระบุ
                  </Checkbox.Content>
                </Checkbox>
              </div>
            </HModal.Body>
            <HModal.Footer>
              <HButton
                className="w-full"
                variant="primary"
                isDisabled={!ack || submitting}
                isPending={submitting}
                onPress={accept}
              >
                {submitting ? "กำลังบันทึก…" : "ยอมรับและดำเนินการต่อ"}
              </HButton>
            </HModal.Footer>
          </HModal.Dialog>
        </HModal.Container>
      </HModal.Backdrop>
    </HModal>
  );
}
