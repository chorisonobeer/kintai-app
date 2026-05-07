/**
 * /src/components/MobileBreakPicker.tsx
 * 休憩時間ピッカー: DrumTimePicker (breakMode) に統一
 */
import React from "react";
import { MobileBreakPickerProps } from "../types";
import DrumTimePicker from "./drumtimepicker";

const MobileBreakPicker: React.FC<MobileBreakPickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <DrumTimePicker
      label="休憩"
      value={value || ""}
      onChange={onChange}
      disabled={disabled}
      breakMode
      placeholder="未設定"
    />
  );
};

export default MobileBreakPicker;
