"use client";
import {
  Button as HButton,
  Chip as HChip,
  Modal as HModal,
  Alert as HAlert,
  ProgressBar as HProgressBar,
  Card as HCard,
  Link as HLink,
  Input as HInput,
  TextArea as HTextArea,
  TextField as HTextField,
  Label as HLabel,
  Description as HDescription,
  FieldError as HFieldError,
  Select as HSelect,
  ListBox as HListBox,
  SearchField as HSearchField,
  Separator as HSeparator,
  Avatar as HAvatar,
  EmptyState as HEmptyState,
  Spinner as HSpinner,
  type Key,
} from "@heroui/react";
import type React from "react";

/* -------------------------------------------------------------------------- */
/* Page header                                                                */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="min-w-0">
        {breadcrumb && <div className="text-xs text-muted mb-1">{breadcrumb}</div>}
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted mt-1">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel — HeroUI Card wrapper                                                */
/* -------------------------------------------------------------------------- */

export function Panel({
  title,
  description,
  actions,
  padded = true,
  className = "",
  variant = "default",
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  padded?: boolean;
  className?: string;
  variant?: "default" | "secondary" | "tertiary" | "transparent";
  children: React.ReactNode;
}) {
  const hasHeader = title || description || actions;
  return (
    <HCard variant={variant} className={className}>
      {hasHeader && (
        <HCard.Header>
          <div className="w-full min-w-0">
            {(title || actions) && (
              <div className="flex items-center justify-between gap-3 min-w-0">
                {title && <HCard.Title className="text-base flex-1 min-w-0">{title}</HCard.Title>}
                {actions && <div className="flex gap-2 flex-wrap shrink-0">{actions}</div>}
              </div>
            )}
            {description && (
              <HCard.Description className={title || actions ? "mt-1" : ""}>
                {description}
              </HCard.Description>
            )}
          </div>
        </HCard.Header>
      )}
      <HCard.Content className={padded ? "" : "!p-0"}>{children}</HCard.Content>
    </HCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat card                                                                  */
/* -------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "brand" | "warn" | "danger" | "success";
}) {
  const iconBg = {
    default: "bg-default text-foreground",
    brand: "bg-accent-soft text-accent-soft-foreground",
    warn: "bg-warning-soft text-warning-soft-foreground",
    danger: "bg-danger-soft text-danger-soft-foreground",
    success: "bg-success-soft text-success-soft-foreground",
  }[tone];
  return (
    <HCard variant="default" className="p-4 flex flex-row items-start gap-3">
      {icon && (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted truncate">{label}</div>
        <div className="mt-1 text-2xl font-semibold leading-tight tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted mt-1 truncate">{hint}</div>}
      </div>
    </HCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Chip / status                                                              */
/* -------------------------------------------------------------------------- */

export type ChipTone = "success" | "warn" | "danger" | "info" | "neutral" | "brand";

const CHIP_COLOR: Record<ChipTone, "accent" | "success" | "warning" | "danger" | "default"> = {
  success: "success",
  warn: "warning",
  danger: "danger",
  info: "accent",
  brand: "accent",
  neutral: "default",
};

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: React.ReactNode }) {
  return <HChip color={CHIP_COLOR[tone]}><HChip.Label>{children}</HChip.Label></HChip>;
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { tone: ChipTone; label: string }> = {
    approved:  { tone: "success", label: "อนุมัติแล้ว" },
    submitted: { tone: "info",    label: "รอตรวจ" },
    pending:   { tone: "warn",    label: "รอดำเนินการ" },
    draft:     { tone: "neutral", label: "ฉบับร่าง" },
    rejected:  { tone: "danger",  label: "ไม่ผ่าน" },
    cancelled: { tone: "neutral", label: "ยกเลิก" },
    needs_fix: { tone: "warn",    label: "ให้แก้ไข" },
  };
  const m = map[status] ?? { tone: "neutral" as ChipTone, label: status };
  return <Chip tone={m.tone}>{m.label}</Chip>;
}

/* -------------------------------------------------------------------------- */
/* Button — HeroUI Button wrapper (adapts onClick → onPress)                  */
/* -------------------------------------------------------------------------- */

type BtnVariant = "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "danger" | "danger-soft";
type BtnSize = "sm" | "md" | "lg";

export interface ButtonProps {
  variant?: BtnVariant;
  size?: BtnSize;
  isPending?: boolean;
  isIconOnly?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  isDisabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onPress?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
  children?: React.ReactNode;
  slot?: string;
  "aria-label"?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  isPending,
  isIconOnly,
  fullWidth,
  disabled,
  isDisabled,
  onClick,
  onPress,
  className,
  children,
  ...rest
}: ButtonProps) {
  const handlePress = onPress ?? (onClick ? () => onClick({} as React.MouseEvent) : undefined);
  return (
    <HButton
      variant={variant}
      size={size}
      isPending={isPending}
      isIconOnly={isIconOnly}
      fullWidth={fullWidth}
      isDisabled={disabled || isDisabled}
      onPress={handlePress}
      className={className}
      {...rest}
    >
      {isPending ? (
        <>
          <HSpinner color="current" size="sm" />
          {children}
        </>
      ) : children}
    </HButton>
  );
}

/* -------------------------------------------------------------------------- */
/* Input primitives                                                           */
/* -------------------------------------------------------------------------- */

type ExtraInputProps = { fullWidth?: boolean; variant?: "primary" | "secondary" };
export function TextInput(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "style"> & ExtraInputProps & { className?: string; style?: React.CSSProperties },
) {
  return <HInput {...(props as React.ComponentProps<typeof HInput>)} />;
}
export function TextArea(
  props: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "style"> & ExtraInputProps & { className?: string; style?: React.CSSProperties },
) {
  return <HTextArea {...(props as React.ComponentProps<typeof HTextArea>)} />;
}

/* Legacy native-select wrapper — kept for pages that still use <option> children */
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return (
    <select
      {...rest}
      className={
        "h-9 rounded-lg border border-border bg-surface px-3 pr-8 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60 disabled:cursor-not-allowed " +
        className
      }
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'><path fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.24 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z'/></svg>\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
        backgroundSize: "16px",
        appearance: "none",
        ...(props.style ?? {}),
      }}
    />
  );
}

/* Field group — wraps a Label + child input in HeroUI TextField-like markup */
export function FieldGroup({
  label,
  hint,
  error,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <HLabel>{label}</HLabel>}
      {children}
      {hint && !error && <HDescription>{hint}</HDescription>}
      {error && <HFieldError>{error}</HFieldError>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SelectField — HeroUI Select with options array                             */
/* -------------------------------------------------------------------------- */

export interface SelectOption {
  id: string;
  label: React.ReactNode;
  textValue?: string;
  isDisabled?: boolean;
}

export function SelectField({
  label,
  placeholder,
  value,
  onChange,
  options,
  className,
  isDisabled,
  hint,
}: {
  label?: React.ReactNode;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  options: SelectOption[];
  className?: string;
  isDisabled?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <HSelect
      className={className}
      placeholder={placeholder}
      isDisabled={isDisabled}
      selectedKey={value ?? null}
      onSelectionChange={(k: Key | null) => onChange?.(String(k ?? ""))}
    >
      {label && <HLabel>{label}</HLabel>}
      <HSelect.Trigger>
        <HSelect.Value />
        <HSelect.Indicator />
      </HSelect.Trigger>
      <HSelect.Popover>
        <HListBox>
          {options.map(o => (
            <HListBox.Item key={o.id} id={o.id} textValue={o.textValue ?? String(o.label)} isDisabled={o.isDisabled}>
              {o.label}
              <HListBox.ItemIndicator />
            </HListBox.Item>
          ))}
        </HListBox>
      </HSelect.Popover>
      {hint && <HDescription>{hint}</HDescription>}
    </HSelect>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal wrapper                                                              */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
  footer,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const sizeCls = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-2xl",
  }[size];
  return (
    <HModal>
      <HModal.Backdrop isOpen={open} onOpenChange={o => { if (!o) onClose(); }}>
        <HModal.Container>
          <HModal.Dialog className={sizeCls}>
            <HModal.CloseTrigger />
            {(title || icon) && (
              <HModal.Header>
                {icon && (
                  <HModal.Icon className="bg-accent-soft text-accent-soft-foreground">
                    {icon}
                  </HModal.Icon>
                )}
                {title && <HModal.Heading>{title}</HModal.Heading>}
              </HModal.Header>
            )}
            <HModal.Body>{children}</HModal.Body>
            {footer && <HModal.Footer>{footer}</HModal.Footer>}
          </HModal.Dialog>
        </HModal.Container>
      </HModal.Backdrop>
    </HModal>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty / loading                                                            */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <HEmptyState className="flex flex-col items-center justify-center gap-3 text-center py-10">
      {icon && <div className="text-muted">{icon}</div>}
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <div className="text-sm text-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </HEmptyState>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress bar                                                               */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  tone = "brand",
  label,
  showValue = false,
}: {
  value: number;
  tone?: "brand" | "warn" | "danger" | "success";
  label?: string;
  showValue?: boolean;
}) {
  const color = { brand: "accent", warn: "warning", danger: "danger", success: "success" }[tone] as
    | "accent" | "warning" | "danger" | "success";
  const v = Math.max(0, Math.min(100, value));
  return (
    <HProgressBar aria-label={label ?? "Progress"} value={v} color={color}>
      {label && <HLabel>{label}</HLabel>}
      {showValue && <HProgressBar.Output />}
      <HProgressBar.Track>
        <HProgressBar.Fill />
      </HProgressBar.Track>
    </HProgressBar>
  );
}

/* -------------------------------------------------------------------------- */
/* Alert                                                                      */
/* -------------------------------------------------------------------------- */

export function Alert({
  status = "default",
  title,
  description,
  action,
  icon,
}: {
  status?: "default" | "accent" | "success" | "warning" | "danger";
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <HAlert status={status === "default" ? undefined : status}>
      <HAlert.Indicator>{icon}</HAlert.Indicator>
      <HAlert.Content>
        <HAlert.Title>{title}</HAlert.Title>
        {description && <HAlert.Description>{description}</HAlert.Description>}
      </HAlert.Content>
      {action}
    </HAlert>
  );
}

/* -------------------------------------------------------------------------- */
/* Search field                                                               */
/* -------------------------------------------------------------------------- */

export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <HSearchField value={value} onChange={onChange} aria-label={ariaLabel ?? "Search"} className={className}>
      <HSearchField.Group>
        <HSearchField.SearchIcon />
        <HSearchField.Input placeholder={placeholder} />
        {value && <HSearchField.ClearButton />}
      </HSearchField.Group>
    </HSearchField>
  );
}

/* -------------------------------------------------------------------------- */
/* Re-exports for convenience                                                 */
/* -------------------------------------------------------------------------- */

export {
  HLink as Link,
  HSeparator as Separator,
  HAvatar as Avatar,
  HSpinner as Spinner,
  HLabel as Label,
  HDescription as Description,
  HFieldError as FieldError,
};
