import React from "react";
import { MobileTimePickerProps } from "../types";
import DrumTimePicker from "./drumtimepicker";

const MobileTimePicker: React.FC<MobileTimePickerProps> = ({
  label,
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="form-group time-picker-group">
      <DrumTimePicker
        label={label}
        value={value || ""}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
};

export default MobileTimePicker;
