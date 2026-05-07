/**
 * /src/components/MobileDatePicker.tsx
 * 日付ヘッダー: 前日/日付表示/翌日 を1枚のカード型UIに集約。
 * 寸法は全て clamp(min, dvh, max)。
 */
import React, { useState, useEffect } from "react";
import styled from "styled-components";
import DatePicker, { registerLocale } from "react-datepicker";
import { ja } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";

registerLocale("ja", ja);

interface MobileDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  disabled?: boolean;
  selectableDates?: { value: string; label: string }[];
  isEditing?: boolean;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAY_COLORS = [
  "#ef4444", // 日
  "#475569",
  "#475569",
  "#475569",
  "#475569",
  "#475569",
  "#2563eb", // 土
];

const MobileDatePicker: React.FC<MobileDatePickerProps> = ({
  value,
  onChange,
  disabled = false,
  isEditing = false,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setSelectedDate(value ? new Date(value) : new Date());
  }, [value]);

  const formatYMD = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
    if (date) {
      onChange(formatYMD(date));
    }
    setShowPicker(false);
  };

  const handlePreviousDay = () => {
    if (!selectedDate || disabled) return;
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    handleDateChange(prev);
  };

  const handleNextDay = () => {
    if (!selectedDate || disabled) return;
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    handleDateChange(next);
  };

  // 表示用パーツ
  const display = (() => {
    if (!value) return { md: "--/--", weekday: "", weekdayIdx: 0, year: "" };
    const d = new Date(value);
    const md = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    const weekdayIdx = d.getDay();
    return {
      md,
      weekday: WEEKDAYS[weekdayIdx],
      weekdayIdx,
      year: String(d.getFullYear()),
    };
  })();

  // 編集中はナビゲーション無効化
  const navDisabled = disabled || isEditing;

  return (
    <Card>
      <NavButton
        type="button"
        onClick={handlePreviousDay}
        disabled={navDisabled}
        aria-label="前日"
      >
        <ChevronLeftIcon strokeWidth={2.2} />
      </NavButton>

      <DateBody
        type="button"
        onClick={() => !disabled && setShowPicker(true)}
        disabled={disabled}
        aria-label="日付選択"
      >
        <DateMain>
          <DateMD>{display.md}</DateMD>
          <DateWeek $color={WEEKDAY_COLORS[display.weekdayIdx]}>
            {display.weekday}
          </DateWeek>
        </DateMain>
        <DateYear>{display.year}</DateYear>
      </DateBody>

      <NavButton
        type="button"
        onClick={handleNextDay}
        disabled={navDisabled}
        aria-label="翌日"
      >
        <ChevronRightIcon strokeWidth={2.2} />
      </NavButton>

      {showPicker && !disabled && (
        <PickerOverlay onClick={() => setShowPicker(false)}>
          <PickerWrap onClick={(e) => e.stopPropagation()}>
            <DatePicker
              selected={selectedDate}
              onChange={handleDateChange}
              dateFormat="yyyy/MM/dd (eee)"
              locale="ja"
              inline
              disabled={disabled}
            />
          </PickerWrap>
        </PickerOverlay>
      )}
    </Card>
  );
};

export default MobileDatePicker;

/* ──────────────── styled ──────────────── */

const Card = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: clamp(6px, 1.2dvh, 12px);
  width: 100%;
  height: 100%;
  padding: 0 clamp(6px, 1.2dvh, 12px);
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: clamp(10px, 1.8dvh, 14px);
  position: relative;
  min-height: 0;
`;

const NavButton = styled.button`
  flex: 0 0 auto;
  width: clamp(38px, 6dvh, 52px);
  height: clamp(38px, 6dvh, 52px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #475569;
  border: 1px solid #e2e8f0;
  border-radius: 50%;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s,
    transform 0.08s;
  font-family: inherit;
  line-height: 1;
  padding: 0;

  & svg {
    width: clamp(15px, 2.4dvh, 20px);
    height: clamp(15px, 2.4dvh, 20px);
  }

  &:hover:not(:disabled) {
    background: #f8fafc;
    color: #3730a3;
    border-color: #c7d2fe;
  }
  &:active:not(:disabled) {
    transform: scale(0.95);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const DateBody = styled.button`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(1px, 0.2dvh, 2px);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: clamp(4px, 0.8dvh, 8px) clamp(8px, 1.6dvh, 14px);
  font-family: inherit;
  border-radius: clamp(8px, 1.4dvh, 12px);
  transition: background 0.15s;
  min-width: 0;

  &:hover:not(:disabled) {
    background: #f8fafc;
  }
  &:disabled {
    cursor: default;
  }
`;

const DateMain = styled.div`
  display: flex;
  align-items: baseline;
  gap: clamp(6px, 1dvh, 10px);
`;

const DateMD = styled.span`
  font-size: clamp(22px, 3.6dvh, 30px);
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.05;
`;

const DateWeek = styled.span<{ $color: string }>`
  font-size: clamp(13px, 2dvh, 16px);
  font-weight: 600;
  color: ${(p) => p.$color};
  letter-spacing: 0;
`;

const DateYear = styled.span`
  font-size: clamp(10px, 1.5dvh, 12px);
  color: #64748b;
  font-weight: 500;
  letter-spacing: 0.02em;
`;

const PickerOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: clamp(12px, 2.4dvh, 24px);
`;

const PickerWrap = styled.div`
  background: #ffffff;
  border-radius: clamp(12px, 2dvh, 16px);
  border: 1px solid #e2e8f0;
  box-shadow: 0 clamp(6px, 1.2dvh, 12px) clamp(16px, 3dvh, 28px)
    rgba(15, 23, 42, 0.16);
  padding: clamp(8px, 1.4dvh, 14px);
`;
