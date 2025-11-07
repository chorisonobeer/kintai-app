/**
 * /src/components/MobileDatePicker.tsx
 * 2025-01-20T10:00:00+09:00
 * 変更概要: 日付移動機能（＜＞ボタン）を追加
 */
import React, { useState, useEffect } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { ja } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

// 日本語ロケールを登録
registerLocale("ja", ja);

interface MobileDatePickerProps {
  value: string; // YYYY-MM-DD 形式
  onChange: (date: string) => void;
  disabled?: boolean;
  selectableDates?: { value: string; label: string }[];
  isEditing?: boolean; // 編集モード状態
}

const MobileDatePicker: React.FC<MobileDatePickerProps> = ({
  value,
  onChange,
  disabled = false,
  isEditing = false,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    if (value) {
      setSelectedDate(new Date(value));
    } else {
      setSelectedDate(new Date()); // デフォルトは今日
    }
  }, [value]);

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
    if (date) {
      // YYYY-MM-DD 形式の文字列で onChange を呼び出す
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      onChange(`${year}-${month}-${day}`);
    }
  };

  // 表示用の日付フォーマット（曜日付き）
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const weekday = weekdays[date.getDay()];
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} (${weekday})`;
  };

  // 前の日に移動
  const handlePreviousDay = () => {
    if (selectedDate) {
      const prevDate = new Date(selectedDate);
      prevDate.setDate(prevDate.getDate() - 1);
      handleDateChange(prevDate);
    }
  };

  // 次の日に移動
  const handleNextDay = () => {
    if (selectedDate) {
      const nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + 1);
      handleDateChange(nextDate);
    }
  };

  return (
    <div className="form-group date-picker-group">
      <label>日付 / Date</label>

      <div className="month-control">
        <div className="month-selector">
          {!isEditing && (
            <button
              type="button"
              className="month-nav-button"
              onClick={handlePreviousDay}
              disabled={disabled}
              aria-label="前日 / Previous day"
            >
              ＜
            </button>
          )}

          {disabled ? (
            <h2 className="date-display">{formatDisplayDate(value)}</h2>
          ) : (
            <DatePicker
              selected={selectedDate}
              onChange={handleDateChange}
              dateFormat="yyyy/MM/dd (eee)"
              locale="ja"
              className="custom-datepicker-input"
              popperPlacement="bottom-start"
              disabled={disabled}
            />
          )}

          {!isEditing && (
            <button
              type="button"
              className="month-nav-button"
              onClick={handleNextDay}
              disabled={disabled}
              aria-label="翌日 / Next day"
            >
              ＞
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileDatePicker;
