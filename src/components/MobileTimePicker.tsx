import React, { useState, useRef, useEffect } from 'react';
import Picker from 'react-mobile-picker';
import { MobileTimePickerProps } from '../types';

interface TimePickerValue {
  hour: string;
  minute: string;
}

const MobileTimePicker: React.FC<MobileTimePickerProps> = ({ 
  label, 
  value, 
  onChange, 
  disabled = false 
}) => {
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];
  
  // 初期化されたかどうかを追跡
  const initializedRef = useRef(false);
  
  // 現在の値を分解
  const [hour, minute] = value ? value.split(':') : ['09', '00'];
  
  // 最も近い15分刻みを見つける
  const closestMinute = React.useMemo(() => {
    const min = parseInt(minute, 10);
    return minutes.reduce((prev, curr) => {
      const prevDiff = Math.abs(parseInt(prev, 10) - min);
      const currDiff = Math.abs(parseInt(curr, 10) - min);
      return currDiff < prevDiff ? curr : prev;
    });
  }, [minute, minutes]);
  
  // ローカル状態（内部用）
  const [pickerValue, setPickerValue] = useState<TimePickerValue>({
    hour: hour.padStart(2, '0'),
    minute: closestMinute
  });
  
  // ユーザーの変更を処理
  const handlePickerChange = (newValue: any) => {
    const typedValue = newValue as TimePickerValue;
    setPickerValue(typedValue);
    
    // 親コンポーネントに変更を通知（ただし初期化後のみ）
    if (initializedRef.current) {
      const newTimeString = `${typedValue.hour}:${typedValue.minute}`;
      if (newTimeString !== value) {
        onChange(newTimeString);
      }
    }
  };
  
  // 初期化とpropsの変更を処理
  useEffect(() => {
    // propsの値が変わったとき、かつ内部の値と異なる場合のみ更新
    const newHour = hour.padStart(2, '0');
    if (pickerValue.hour !== newHour || pickerValue.minute !== closestMinute) {
      setPickerValue({
        hour: newHour,
        minute: closestMinute
      });
    }
    
    // 初期化完了をマーク
    if (!initializedRef.current) {
      initializedRef.current = true;
    }
  }, [value, hour, closestMinute]);
  
  // 表示用の時間文字列
  const displayTime = `${pickerValue.hour}:${pickerValue.minute}`;
  
  return (
    <div className="form-group time-picker-group"> {/* Add a specific class for styling */}
      <label>{label}</label>
      <span className="time-display">{displayTime}</span>
      
      <div className="time-picker-wrapper">
        <div className="picker-highlight"></div>
        
        {!disabled && (
          <Picker
            value={pickerValue}
            onChange={handlePickerChange}
            height={90}
            itemHeight={30}
            wheelMode="normal"
            style={{ margin: '0 auto' }}
          >
            <Picker.Column name="hour">
              {hours.map(h => (
                <Picker.Item key={h} value={h}>
                  {h}
                </Picker.Item>
              ))}
            </Picker.Column>
            <Picker.Column name="minute">
              {minutes.map(m => (
                <Picker.Item key={m} value={m}>
                  {m}
                </Picker.Item>
              ))}
            </Picker.Column>
          </Picker>
        )}
      </div>
    </div>
  );
};

export default MobileTimePicker;