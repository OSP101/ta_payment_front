"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Autocomplete, EmptyState, Label, ListBox, SearchField, useFilter } from "@heroui/react";
import type { Key } from "react-aria-components";
import { FieldGroup } from "./ui";
import { useI18n } from "../lib/i18n/client";

/** GET /thai-address — embedded on the server (service/thai_address.go):
 *  [[provinceID, name, [[districtID, name, [[subDistrictID, name, zip]]]]]] */
type SubRow = [number, string, number];
type DistRow = [number, string, SubRow[]];
type ProvRow = [number, string, DistRow[]];
interface ThaiAddressData { p: ProvRow[] }

const BANGKOK = 1;

/**
 * จังหวัด → อำเภอ/เขต → ตำบล/แขวง, each a searchable list. Only the
 * sub-district code leaves this component (`subDistrictId`); picking one also
 * hands its postal code to `onZip` so the form can pre-fill it.
 *
 * The list is served by the backend that also validates the pick, so the two
 * can never disagree. Cached by SWR and by the browser (ETag, one day).
 */
export function ThaiAddressPicker({
  subDistrictId, onChange, onZip, error,
}: {
  subDistrictId: number;
  onChange: (subDistrictId: number) => void;
  onZip: (zip: string) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const { data, error: loadErr } = useSWR<ThaiAddressData>("/thai-address", {
    revalidateOnFocus: false, revalidateIfStale: false,
  });

  // sub-district → [province, district]. The dataset's province ids are 1–77,
  // not the code prefix, so the parents are looked up, not derived.
  const parents = useMemo(() => {
    const m = new Map<number, [number, number]>();
    for (const p of data?.p ?? []) for (const d of p[2]) for (const s of d[2]) m.set(s[0], [p[0], d[0]]);
    return m;
  }, [data]);

  // Picks above the sub-district. Once a sub-district is chosen they follow
  // from it; before that they are the TA's partial choice.
  const [prov, setProv] = useState(0);
  const [dist, setDist] = useState(0);
  const picked = subDistrictId ? parents.get(subDistrictId) : undefined;
  const provId = picked ? picked[0] : prov;
  const distId = picked ? picked[1] : dist;

  const province = useMemo(() => data?.p.find(p => p[0] === provId), [data, provId]);
  const district = useMemo(() => province?.[2].find(d => d[0] === distId), [province, distId]);
  const bkk = provId === BANGKOK;

  if (loadErr) {
    return (
      <FieldGroup label={t("จังหวัด อำเภอ ตำบล")} error={t("โหลดรายชื่อจังหวัดไม่สำเร็จ กรุณารีเฟรชหน้า")}>
        <div />
      </FieldGroup>
    );
  }

  return (
    <>
      <FieldGroup required label={t("จังหวัด")} error={!provId ? error : undefined}>
        <Picker
          label={t("จังหวัด")}
          searchPlaceholder={t("ค้นหาจังหวัด…")}
          notFound={t("ไม่พบจังหวัดนี้")}
          placeholder={data ? t("เลือกจังหวัด") : t("กำลังโหลด…")}
          isDisabled={!data}
          key={provId ? "p-set" : "p-empty"}
          value={provId || null}
          items={(data?.p ?? []).map(p => ({ id: p[0], name: p[1] }))}
          onPick={id => { setProv(id); setDist(0); onChange(0); }}
        />
      </FieldGroup>
      <FieldGroup required label={bkk ? t("เขต") : t("อำเภอ")} error={provId && !distId ? error : undefined}>
        <Picker
          label={bkk ? t("เขต") : t("อำเภอ")}
          searchPlaceholder={bkk ? t("ค้นหาเขต…") : t("ค้นหาอำเภอ…")}
          notFound={bkk ? t("ไม่พบเขตนี้") : t("ไม่พบอำเภอนี้")}
          placeholder={province ? (bkk ? t("เลือกเขต") : t("เลือกอำเภอ")) : t("เลือกจังหวัดก่อน")}
          isDisabled={!province}
          key={distId ? "d-set" : "d-empty"}
          value={distId || null}
          items={(province?.[2] ?? []).map(d => ({ id: d[0], name: d[1] }))}
          onPick={id => { setProv(provId); setDist(id); onChange(0); }}
        />
      </FieldGroup>
      <FieldGroup required label={bkk ? t("แขวง") : t("ตำบล")} error={distId && !subDistrictId ? error : undefined}>
        <Picker
          label={bkk ? t("แขวง") : t("ตำบล")}
          searchPlaceholder={bkk ? t("ค้นหาแขวง…") : t("ค้นหาตำบล…")}
          notFound={bkk ? t("ไม่พบแขวงนี้") : t("ไม่พบตำบลนี้")}
          placeholder={district ? (bkk ? t("เลือกแขวง") : t("เลือกตำบล")) : (bkk ? t("เลือกเขตก่อน") : t("เลือกอำเภอก่อน"))}
          isDisabled={!district}
          key={subDistrictId ? "s-set" : "s-empty"}
          value={subDistrictId || null}
          items={(district?.[2] ?? []).map(s => ({ id: s[0], name: s[1] }))}
          onPick={id => {
            const sub = district?.[2].find(s => s[0] === id);
            setProv(provId); setDist(distId);
            onChange(id);
            if (sub) onZip(String(sub[2]).padStart(5, "0"));
          }}
        />
      </FieldGroup>
    </>
  );
}

/** Callers key it on "has a value": HeroUI's hidden input flips between
 *  controlled and uncontrolled when the value goes to/from null (React warns),
 *  so it is remounted at that edge instead. */
function Picker({
  label, searchPlaceholder, notFound, placeholder, items, value, onPick, isDisabled,
}: {
  label: string;
  searchPlaceholder: string;
  notFound: string;
  placeholder: string;
  items: { id: number; name: string }[];
  value: number | null;
  onPick: (id: number) => void;
  isDisabled?: boolean;
}) {
  const { contains } = useFilter({ sensitivity: "base" });
  return (
    <Autocomplete
      className="w-full"
      placeholder={placeholder}
      selectionMode="single"
      isDisabled={isDisabled}
      value={value}
      onChange={(k: Key | Key[] | null) => { if (k != null && !Array.isArray(k)) onPick(Number(k)); }}
    >
      <Label className="sr-only">{label}</Label>
      <Autocomplete.Trigger>
        <Autocomplete.Value />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField autoFocus name="search" variant="secondary">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={searchPlaceholder} />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox
            className="max-h-[280px] overflow-y-auto"
            renderEmptyState={() => <EmptyState>{notFound}</EmptyState>}
          >
            {items.map(it => (
              <ListBox.Item key={it.id} id={it.id} textValue={it.name}>
                {it.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
