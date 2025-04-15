import React, { useState, useEffect } from 'react';
import Picker from 'react-mobile-picker';
import { MobileBreakPickerProps } from '../types';

// 休憩時間のオプション（分）- 選択肢を減らす
const breakTimeOptions = [0, 15, 30, 45, 60, 90, 120];

// 休憩時間ピッカー用の型定義
interface BreakPickerValue {
  breakTime: string;
}

const MobileBreakPicker: React.FC<MobileBreakPickerProps> = ({ 
  value, 
  onChange, 
  disabled = false 
}) => {
  // 初期値を直接設定
  const [pickerValue, setPickerValue] = useState<BreakPickerValue>({
    breakTime: String(value)
  });

  // valueが変わった時のみpickerValueを更新
  useEffect(() => {
    if (String(value) !== pickerValue.breakTime) {
      setPickerValue({ breakTime: String(value) });
    }
  }, [value]);

  // pickerValueが変わったら親コンポーネントに通知
  useEffect(() => {
    const newBreakTime = Number(pickerValue.breakTime);
    if (newBreakTime !== value) {
      onChange(newBreakTime);
    }
  }, [pickerValue.breakTime, onChange]); // valueを依存配列から除外

  // 型アサーションを使用して型の互換性を確保
  const handlePickerChange = (newValue: any) => {
    setPickerValue(newValue as BreakPickerValue);
  };

  const formatBreakTime = (minutes: number): string => {
    return minutes === 0 ? 'なし' : `${minutes}分`;
  };

  return (
    <div className="form-group">
      <label>休憩時間</label>
      <span className="time-display">{formatBreakTime(Number(pickerValue.breakTime))}</span>
      
      <div className="time-picker-wrapper">
        <div className="picker-highlight"></div>
        
        {!disabled && (
          <Picker
            value={pickerValue}
            onChange={handlePickerChange}
            height={90}
            itemHeight={30}
            wheelMode="normal"
          >
            <Picker.Column name="breakTime">
              {breakTimeOptions.map(minutes => (
                <Picker.Item key={minutes} value={String(minutes)}>
                  {formatBreakTime(minutes)}
                </Picker.Item>
              ))}
            </Picker.Column>
          </Picker>
        )}
      </div>
    </div>
  );
};

export default MobileBreakPicker;