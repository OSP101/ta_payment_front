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
  TimeField as HTimeField,
  DatePicker as HDatePicker,
  DateField as HDateField,
  Calendar as HCalendar,
  Tooltip as HTooltip,
  type Key,
  type TimeValue,
} from "@heroui/react";
import { Info } from "lucide-react";
import { I18nProvider } from "react-aria-components";
import { Time, parseTime, parseDate, type DateValue } from "@internationalized/date";
import type React from "react";
import { Children, isValidElement } from "react";

/* -------------------------------------------------------------------------- */
/* Tooltip helpers                                                            */
/* -------------------------------------------------------------------------- */

// Shared tooltip wrapper — replaces native HTML `title=` so hints work on
// touch (long-press) and keyboard focus, not just mouse hover. Content is
// rendered inside `<HTooltip.Content>` with a max width and pre-line spacing
// so multi-line hints look reasonable.
//
// `Tip` expects a focusable trigger child (button, a, input). For plain
// spans/divs/table cells use `TipWrap`, which wraps the child in
// `<HTooltip.Trigger>` (a focusable role="button" div) so hover + long-press
// still register.
export function Tip({
  content,
  children,
  delay = 0,
  placement,
}: {
  content?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  placement?: "top" | "bottom" | "left" | "right" | "start" | "end";
}) {
  if (content === null || content === undefined || content === false || content === "") {
    return <>{children}</>;
  }
  return (
    <HTooltip delay={delay}>
      {children}
      <HTooltip.Content placement={placement}>
        <div className="max-w-xs text-xs leading-relaxed whitespace-pre-line">{content}</div>
      </HTooltip.Content>
    </HTooltip>
  );
}

export function TipWrap({
  content,
  children,
  delay = 0,
  placement,
  className,
}: {
  content?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  placement?: "top" | "bottom" | "left" | "right" | "start" | "end";
  className?: string;
}) {
  if (content === null || content === undefined || content === false || content === "") {
    return <>{children}</>;
  }
  return (
    <HTooltip delay={delay}>
      <HTooltip.Trigger className={className}>{children}</HTooltip.Trigger>
      <HTooltip.Content placement={placement}>
        <div className="max-w-xs text-xs leading-relaxed whitespace-pre-line">{content}</div>
      </HTooltip.Content>
    </HTooltip>
  );
}

// InfoTip renders an "i" icon that reveals `content` on hover/focus/long-press.
// Used for occasional-read guidance next to titles or field labels.
export function InfoTip({
  content,
  size = 14,
  className,
}: {
  content?: React.ReactNode;
  size?: number;
  className?: string;
}) {
  if (!content) return null;
  return (
    <Tip content={content}>
      <button
        type="button"
        aria-label="คำอธิบาย"
        className={
          "inline-flex items-center justify-center text-muted hover:text-foreground transition-colors rounded-full " +
          (className ?? "")
        }
      >
        <Info size={size} />
      </button>
    </Tip>
  );
}

/* -------------------------------------------------------------------------- */
/* Page header                                                                */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  info,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  // Optional tooltip content rendered on an "i" icon next to the title.
  // Preferred over `description` for anything the reader only occasionally
  // needs — keeps the header visually clean without hiding the explanation.
  info?: React.ReactNode;
  breadcrumb?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="min-w-0">
        {breadcrumb && <div className="text-xs text-muted mb-1">{breadcrumb}</div>}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">{title}</h1>
          {info && <InfoTip content={info} size={16} />}
        </div>
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
  info,
  actions,
  padded = true,
  className = "",
  variant = "default",
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  // Same intent as PageHeader.info — put occasional-read guidance behind an
  // "i" icon so the panel header stays visually calm. When both `description`
  // and `info` are set, description still renders (info supplements it).
  info?: React.ReactNode;
  actions?: React.ReactNode;
  padded?: boolean;
  className?: string;
  variant?: "default" | "secondary" | "tertiary" | "transparent";
  children: React.ReactNode;
}) {
  const hasHeader = title || description || actions || info;
  return (
    <HCard variant={variant} className={className}>
      {hasHeader && (
        <HCard.Header>
          <div className="w-full min-w-0">
            {(title || actions || info) && (
              <div className="flex items-center justify-between gap-3 min-w-0">
                {(title || info) && (
                  <HCard.Title className="text-base flex-1 min-w-0">
                    <span className="inline-flex items-center gap-2">
                      {title}
                      {info && <InfoTip content={info} />}
                    </span>
                  </HCard.Title>
                )}
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
/* Tab label — shared visual for Tabs.Tab children (icon + text + count pill) */
/* -------------------------------------------------------------------------- */

export function TabLabel({
  icon,
  children,
  count,
  active,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Optional numeric badge shown to the right of the label. */
  count?: number;
  /** Whether this tab is currently selected — tweaks the count-pill contrast. */
  active?: boolean;
}) {
  const showCount = typeof count === "number" && count > 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span>{children}</span>
      {showCount && (
        <span
          className={
            "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums transition-colors " +
            (active
              ? "bg-(--brand) text-white"
              : "bg-slate-100 text-slate-600")
          }
        >
          {count}
        </span>
      )}
    </span>
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
  // HeroUI expects a leading icon to be a DIRECT child of <Chip>, with only the
  // text inside <Chip.Label> (see docs "with-icons"). Callers pass icons inline
  // (`<Chip><Icon/> text</Chip>`); splitting the leading element(s) out here
  // fixes the icon/text alignment everywhere without touching each call site.
  const kids = Children.toArray(children);
  const leadingIcons: React.ReactNode[] = [];
  const rest: React.ReactNode[] = [];
  let seenText = false;
  for (const k of kids) {
    if (!seenText && isValidElement(k)) leadingIcons.push(k);
    else { seenText = true; rest.push(k); }
  }
  return (
    <HChip color={CHIP_COLOR[tone]}>
      {leadingIcons}
      <HChip.Label>{rest}</HChip.Label>
    </HChip>
  );
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
  title?: string;
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
  // Adapt legacy onClick to onPress. Supply a stub event whose common methods
  // are safe no-ops so callers that call e.preventDefault()/stopPropagation()
  // don't crash.
  const handlePress =
    onPress ??
    (onClick
      ? () =>
          onClick({
            preventDefault() {},
            stopPropagation() {},
            currentTarget: null,
            target: null,
          } as unknown as React.MouseEvent)
      : undefined);
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

/**
 * IconButton — the app-wide standard for icon-only action buttons (repeated
 * table-row actions, toolbar controls, etc.). Enforces accessibility by
 * construction: `label` becomes BOTH the aria-label (screen readers) and the
 * native `title` (hover tooltip), so an icon-only button can never ship without
 * a name. Use this instead of `<Button isIconOnly>` so every icon-only button
 * is labelled the same way.
 *
 * Convention: page/form/primary/save/destructive-confirm buttons keep icon+text
 * (`<Button>`); dense repeated row actions use `<IconButton label="…">`.
 */
export function IconButton({
  label,
  children,
  ...props
}: Omit<ButtonProps, "isIconOnly" | "aria-label"> & { label: string }) {
  return (
    <Tip content={label} delay={400}>
      <Button {...props} isIconOnly aria-label={label}>
        {children}
      </Button>
    </Tip>
  );
}

/* -------------------------------------------------------------------------- */
/* Input primitives                                                           */
/* -------------------------------------------------------------------------- */

type ExtraInputProps = { fullWidth?: boolean; variant?: "primary" | "secondary" };
export function TextInput(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "style"> & ExtraInputProps & { className?: string; style?: React.CSSProperties },
) {
  // Force 24-hour clock for time inputs regardless of the user's OS locale.
  // Chrome/Edge honor the input-level `lang` attribute for time formatting,
  // and en-GB uses 24h — matches how the whole system stores and reasons
  // about times (HH:MM 24h). Callers can still override by passing lang.
  const withLang =
    props.type === "time" && props.lang === undefined ? { ...props, lang: "en-GB" } : props;
  return <HInput {...(withLang as React.ComponentProps<typeof HInput>)} />;
}

/**
 * Segmented 24-hour time picker built on HeroUI's TimeField. Speaks the same
 * "HH:MM" string protocol the rest of the app uses (matches Go time.Time and
 * <input type="time"> so callers can stay uniform). Renders as a labeled group
 * matching the other HeroUI form components on the page.
 */
export function TimePicker({
  value,
  onChange,
  label,
  className,
  isDisabled,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  className?: string;
  isDisabled?: boolean;
  autoFocus?: boolean;
}) {
  const parsed: Time | null = (() => {
    if (!value) return null;
    try { return parseTime(value.length === 5 ? value + ":00" : value); }
    catch { return null; }
  })();
  const toString = (v: TimeValue | null): string => {
    if (!v) return "";
    return `${String(v.hour).padStart(2, "0")}:${String(v.minute).padStart(2, "0")}`;
  };
  return (
    <HTimeField
      className={className}
      hourCycle={24}
      value={parsed}
      onChange={v => onChange(toString(v))}
      isDisabled={isDisabled}
      autoFocus={autoFocus}
      aria-label={label ?? "time"}
    >
      <HTimeField.Group>
        <HTimeField.Input>
          {(segment) => <HTimeField.Segment segment={segment} />}
        </HTimeField.Input>
      </HTimeField.Group>
    </HTimeField>
  );
}

/**
 * Segmented date picker with a calendar popover. Locked to en-GB locale so
 * segments render as dd/mm/yyyy regardless of the user's browser locale —
 * consistent with how the whole system stores dates (ISO YYYY-MM-DD) and
 * matches the Thai date preview shown alongside the input in the worklog UI.
 * Speaks the same "YYYY-MM-DD" string protocol as <input type="date">.
 */
export function DatePicker({
  value,
  onChange,
  label,
  className,
  isDisabled,
  autoFocus,
  minValue,
  maxValue,
}: {
  value: string;
  onChange: (nextIso: string) => void;
  label?: string;
  className?: string;
  isDisabled?: boolean;
  autoFocus?: boolean;
  /** Earliest selectable date, ISO "YYYY-MM-DD". */
  minValue?: string;
  /** Latest selectable date, ISO "YYYY-MM-DD". */
  maxValue?: string;
}) {
  const parsed: DateValue | null = (() => {
    if (!value) return null;
    try { return parseDate(value); } catch { return null; }
  })();
  const parseBound = (s?: string): DateValue | undefined => {
    if (!s) return undefined;
    try { return parseDate(s); } catch { return undefined; }
  };
  const toIso = (v: DateValue | null): string => {
    if (!v) return "";
    return `${v.year}-${String(v.month).padStart(2, "0")}-${String(v.day).padStart(2, "0")}`;
  };
  return (
    <I18nProvider locale="en-GB">
      <HDatePicker
        className={className}
        value={parsed}
        onChange={v => onChange(toIso(v))}
        isDisabled={isDisabled}
        autoFocus={autoFocus}
        minValue={parseBound(minValue)}
        maxValue={parseBound(maxValue)}
        aria-label={label ?? "date"}
      >
        <HDateField.Group>
          <HDateField.Input>
            {segment => <HDateField.Segment segment={segment} />}
          </HDateField.Input>
          <HDateField.Suffix>
            <HDatePicker.Trigger>
              <HDatePicker.TriggerIndicator />
            </HDatePicker.Trigger>
          </HDateField.Suffix>
        </HDateField.Group>
        <HDatePicker.Popover>
          <HCalendar aria-label={label ?? "เลือกวันที่"}>
            <HCalendar.Header>
              <HCalendar.YearPickerTrigger>
                <HCalendar.YearPickerTriggerHeading />
                <HCalendar.YearPickerTriggerIndicator />
              </HCalendar.YearPickerTrigger>
              <HCalendar.NavButton slot="previous" />
              <HCalendar.NavButton slot="next" />
            </HCalendar.Header>
            <HCalendar.Grid>
              <HCalendar.GridHeader>
                {day => <HCalendar.HeaderCell>{day}</HCalendar.HeaderCell>}
              </HCalendar.GridHeader>
              <HCalendar.GridBody>
                {date => <HCalendar.Cell date={date} />}
              </HCalendar.GridBody>
            </HCalendar.Grid>
            <HCalendar.YearPickerGrid>
              <HCalendar.YearPickerGridBody>
                {({ year }) => <HCalendar.YearPickerCell year={year} />}
              </HCalendar.YearPickerGridBody>
            </HCalendar.YearPickerGrid>
          </HCalendar>
        </HDatePicker.Popover>
      </HDatePicker>
    </I18nProvider>
  );
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
      {/* Plain div, not HeroUI FieldError: FieldError only renders inside a
          field marked invalid via react-aria validation, and FieldGroup is a
          context-free wrapper — the message would silently disappear. */}
      {error && <div className="text-xs text-danger">{error}</div>}
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
  isRequired,
  hint,
  error,
}: {
  label?: React.ReactNode;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  options: SelectOption[];
  className?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}) {
  return (
    <HSelect
      className={className}
      placeholder={placeholder}
      isDisabled={isDisabled}
      isRequired={isRequired}
      isInvalid={!!error}
      selectedKey={value ?? null}
      onSelectionChange={(k: Key | null) => onChange?.(String(k ?? ""))}
    >
      {label && (
        <HLabel>
          {label}
          {isRequired && <span className="text-danger"> *</span>}
        </HLabel>
      )}
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
      {hint && !error && <HDescription>{hint}</HDescription>}
      {error && <HFieldError>{error}</HFieldError>}
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
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const sizeCls = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-2xl",
    "2xl": "sm:max-w-4xl",
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
/* ConfirmDialog — shared confirmation for destructive/irreversible actions   */
/* -------------------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "ยืนยันการดำเนินการ",
  message,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  danger = false,
  isPending = false,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: React.ReactNode;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isPending?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={() => { if (!isPending) onClose(); }}
      title={title}
      size="sm"
      icon={icon}
      footer={
        <>
          <Button variant="tertiary" onPress={onClose} disabled={isPending}>{cancelLabel}</Button>
          <Button variant={danger ? "danger" : "primary"} onPress={onConfirm} isPending={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {typeof message === "string" ? <p className="text-sm text-muted">{message}</p> : message}
    </Modal>
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
    <HProgressBar aria-label={label ?? "ความคืบหน้า"} value={v} color={color}>
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

// House standard for every search box: full width on phones, a fixed 18rem
// (288px) from the `sm` breakpoint up. Search inputs stretched to the full
// container read as form fields and hurt scannability, so callers should keep
// this default — pass `className` only when a layout genuinely needs otherwise.
const SEARCH_FIELD_WIDTH = "w-full sm:w-72";

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
    <HSearchField
      value={value}
      onChange={onChange}
      aria-label={ariaLabel ?? "ค้นหา"}
      className={className ?? SEARCH_FIELD_WIDTH}
    >
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
