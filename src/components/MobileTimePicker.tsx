/**
 * /src/components/MobileTimePicker.tsx
 * 2025-01-27T10:00+09:00
 * 変更概要: selectピッカー形式に変更、7:00-20:00の時間範囲、出勤時間は8:00、退勤時間は17:00を初期表示
 */
import React from "react";
import { MobileTimePickerProps } from "../types";

const MobileTimePicker: React.FC<MobileTimePickerProps> = ({
  label,
  value,
  onChange,
  disabled = false,
}) => {
  // 7:00から20:00までの15分間隔の時間配列を生成
  const generateTimeOptions = () => {
    const times = [];
    for (let hours = 7; hours <= 20; hours++) {
      for (let minutes = 0; minutes < 60; minutes += 15) {
        const timeString = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
        times.push(timeString);
      }
    }
    return times;
  };

  const timeOptions = generateTimeOptions();

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const timeString = event.target.value;
    onChange(timeString);
  };

  // 表示用の時間文字列を生成
  const formatTime = (timeString: string | undefined | null): string => {
    if (!timeString || timeString === "") {
      return "未入力";
    }
    return timeString;
  };

  return (
    <div className="form-group time-picker-group">
      <label>{label}</label>

      {disabled ? (
        <div className="time-display">{formatTime(value)}</div>
      ) : (
        <select
          value={value || ""}
          onChange={handleSelectChange}
          className="custom-datepicker-input time-input-enabled"
          disabled={disabled}
        >
          <option value="">未入力</option>
          {timeOptions.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default MobileTimePicker;
