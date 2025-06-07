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
  // 0:00から3:00までの15分間隔の時間配列を生成
  const generateTimeOptions = () => {
    const times = [];
    for (let hours = 0; hours <= 3; hours++) {
      for (let minutes = 0; minutes < 60; minutes += 15) {
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

  // 表示用の休憩時間文字列を生成
  const formatBreakTime = (timeString: string | undefined | null): string => {
    // undefinedやnullの場合は「未入力」を返す
    if (!timeString || timeString === "") {
      return "未入力";
    }

    // 既にHH:mm形式の場合はそのまま返す
    return timeString;
  };

  return (
    <div className="form-group break-picker-group">
      <label>休憩時間</label>

      {disabled ? (
        <div className="time-display">{formatBreakTime(value)}</div>
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

export default MobileBreakPicker;
