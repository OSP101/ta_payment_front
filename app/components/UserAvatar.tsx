"use client";
import { Avatar } from "@heroui/react";
import { useI18n } from "../lib/i18n/client";

/**
 * One place that decides how a person is drawn: their picture when they have
 * one, their initials when they don't. Every header, roster, and profile card
 * goes through here so a newly uploaded photo appears everywhere at once.
 */
export function initialsOf(firstName?: string, lastName?: string): string {
  return ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase() || "U";
}

export default function UserAvatar({
  firstName,
  lastName,
  src,
  size,
  className,
}: {
  firstName?: string;
  lastName?: string;
  /** Comes from the API as `avatar_url`; nullable — no picture set. */
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { t } = useI18n();
  const initials = initialsOf(firstName, lastName);
  const name = [firstName, lastName].filter(Boolean).join(" ");
  return (
    <Avatar size={size} className={className}>
      {src && <Avatar.Image src={src} alt={name ? t("รูปโปรไฟล์ของ {name}", { name }) : t("รูปโปรไฟล์")} />}
      {/* Also the fallback for a broken/expired URL — Avatar.Image reports its
          own load failure and hands over without us tracking it. */}
      <Avatar.Fallback>{initials}</Avatar.Fallback>
    </Avatar>
  );
}
