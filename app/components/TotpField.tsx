"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { InputOTP, REGEXP_ONLY_DIGITS } from "@heroui/react";

type TotpInputProps = Omit<ComponentProps<typeof InputOTP>, "children" | "maxLength" | "pattern">;

/** Six visible slots backed by one input, preserving paste, autofill and keyboard navigation. */
export function TotpInput(props: TotpInputProps) {
  return (
    <InputOTP
      {...props}
      className={`max-[360px]:gap-1 ${props.className ?? ""}`}
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      pasteTransformer={text => text.replace(/[\s-]/g, "")}
    >
      <InputOTP.Group className="max-[360px]:gap-1">
        <InputOTP.Slot className="max-[360px]:w-8" index={0} />
        <InputOTP.Slot className="max-[360px]:w-8" index={1} />
        <InputOTP.Slot className="max-[360px]:w-8" index={2} />
      </InputOTP.Group>
      <InputOTP.Separator />
      <InputOTP.Group className="max-[360px]:gap-1">
        <InputOTP.Slot className="max-[360px]:w-8" index={3} />
        <InputOTP.Slot className="max-[360px]:w-8" index={4} />
        <InputOTP.Slot className="max-[360px]:w-8" index={5} />
      </InputOTP.Group>
    </InputOTP>
  );
}

type TotpFieldProps = TotpInputProps & {
  label: ReactNode;
  error?: string | null;
  className?: string;
};

export default function TotpField({ label, error, className, isInvalid, required = true, ...props }: TotpFieldProps) {
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className ?? ""}`}>
      <label htmlFor={id} id={`${id}-label`} className="text-sm font-medium text-foreground">
        {label}{required && <span aria-hidden="true" className="text-danger"> *</span>}
      </label>
      <TotpInput
        {...props}
        id={id}
        required={required}
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-error` : undefined}
        isInvalid={isInvalid || !!error}
      />
      {error && <p id={`${id}-error`} className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
