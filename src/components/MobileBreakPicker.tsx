/**
 * /src/components/MobileBreakPicker.tsx
 * ${new Date().toISOString()}
 * 変更概要: react-datepickerを使用して他のピッカーと統一感のあるUIに変更
 */
import React, { useState, useEffect } from 'react';
import { MobileBreakPickerProps } from '../types';



const MobileBreakPicker: React.FC<MobileBreakPickerProps> = ({ 
  value, // string (HH:mm format)
  onChange, 
  disabled = false 
}) => {
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);

  useEffect(() => {
    // value (HH:mm形式) をDateオブジェクトに変換
    if (value && value.includes(':')) {
      const [hours, minutes] = value.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      setSelectedTime(date);
    } else {
      setSelectedTime(null);
    }
  }, [value]);

  // 0:00から3:00までの15分間隔の時間配列を生成
  const generateTimeOptions = () => {
    const times = [];
    for (let hours = 0; hours <= 3; hours++) {
      for (let minutes = 0; minutes < 60; minutes += 15) {
        if (hours === 3 && minutes > 0) break; // 3:00で終了
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        times.push(timeString);
      }
    }
    return times;
  };

  const timeOptions = generateTimeOptions();

  // 現在の値を時間文字列に変換
  const getTimeString = (date: Date | null): string => {
    if (!date) return '';
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const currentTimeString = getTimeString(selectedTime);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const timeString = event.target.value;
    if (!timeString) {
      setSelectedTime(null);
      onChange('');
      return;
    }
    
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    setSelectedTime(date);
    onChange(timeString);
  };

  // 表示用の休憩時間文字列を生成
  const formatBreakTime = (timeString: string | undefined | null): string => {
    // undefinedやnullの場合は「未入力」を返す
    if (!timeString || timeString === '') {
      return '未入力';
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
          value={value || ''}
          onChange={handleSelectChange}
          className="custom-datepicker-input time-input-enabled"
          disabled={disabled}
        >
          <option value="">未入力</option>
          {timeOptions.map(time => (
            <option key={time} value={time}>{time}</option>
          ))}
        </select>
      )}
    </div>
  );
};

export default MobileBreakPicker;