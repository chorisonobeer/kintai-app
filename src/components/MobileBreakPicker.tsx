/**
 * /src/components/MobileBreakPicker.tsx
 * ${new Date().toISOString()}
 * 変更概要: react-datepickerを使用して他のピッカーと統一感のあるUIに変更
 */
import React from "react";
import { MobileBreakPickerProps } from "../types";

const MobileBreakPicker: React.FC<MobileBreakPickerProps> = ({
  value, // string (HH:mm format)
  onChange,
  disabled = false,
}) => {
  // 0:15から3:00までの15分間隔の時間配列を生成（0:00は別途追加済み）
  const generateTimeOptions = () => {
    const times = [];
    for (let hours = 0; hours <= 3; hours += 1) {
      for (let minutes = 0; minutes < 60; minutes += 15) {
        if (hours === 0 && minutes === 0) continue; // 0:00はスキップ（別途追加済み）
        if (hours === 3 && minutes > 0) break; // 3:00で終了
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

  return (
    <div className="form-group break-picker-group">
      <label htmlFor="mobileBreakPicker">
        休憩時間
        <select
          id="mobileBreakPicker"
          value={
            value === undefined || value === null || value === "" ? "" : value
          }
          onChange={handleSelectChange}
          className={`custom-datepicker-input ${disabled ? "time-input-disabled" : "time-input-enabled"}`}
          disabled={disabled}
        >
          <option value="">未入力</option>
          <option value="0:00">0:00</option>
          <option value="00:00">00:00</option>
          {timeOptions.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

export default MobileBreakPicker;
