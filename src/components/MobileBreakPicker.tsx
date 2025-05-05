/** 
 * /src/components/MobileBreakPicker.tsx
 * 2025-05-04T20:30+09:00
 * 変更概要: 更新 - スタイル適用方法の修正、TypeScript型エラーの解消
 */
import React, { useEffect } from 'react';
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
  // pickerValueは常に親から受け取ったvalueに基づく
  const pickerValue: BreakPickerValue = {
    breakTime: String(value)
  };

  // スクロール制御のイベントハンドラーを設定
  useEffect(() => {
    // DOMイベントハンドラー型を使用して型エラーを解決
    const handleTouchStart = (e: Event) => {
      // 型キャストを使用してターゲット要素にアクセス
      const targetEl = e.target as HTMLElement;
      
      // ピッカーのホイール部分のタッチ時にbodyのスクロールを無効化
      if (targetEl?.closest('.picker-column')) {
        document.body.style.overflow = 'hidden';
        // DOM APIのイベントはe.stopPropagationのみなのでTypeError解消
        e.stopPropagation();
      }
    };
    
    const handleTouchEnd = () => {
      // タッチ終了後にスクロールを有効化
      document.body.style.overflow = '';
    };
    
    const pickerElement = document.querySelector('.time-picker-wrapper');
    
    if (pickerElement) {
      pickerElement.addEventListener('touchstart', handleTouchStart);
      pickerElement.addEventListener('touchend', handleTouchEnd);
      pickerElement.addEventListener('touchcancel', handleTouchEnd);
    }
    
    return () => {
      if (pickerElement) {
        pickerElement.removeEventListener('touchstart', handleTouchStart);
        pickerElement.removeEventListener('touchend', handleTouchEnd);
        pickerElement.removeEventListener('touchcancel', handleTouchEnd);
      }
    };
  }, []);

  // Reactのタッチイベントハンドラー
  const handleTouchMove = (e: React.TouchEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const touchX = e.touches[0].clientX;
    
    // ホイール中央部分のみイベント伝播を停止
    if (Math.abs(touchX - centerX) < rect.width / 3) {
      e.stopPropagation();
    }
  };

  // 型アサーションを使用して型の互換性を確保
  const handlePickerChange = (newValue: any) => {
    const newBreakTime = Number((newValue as BreakPickerValue).breakTime);
    onChange(newBreakTime);
  };

  const formatBreakTime = (minutes: number): string => {
    return minutes === 0 ? 'なし' : `${minutes}分`;
  };
  
  return (
    <div className="form-group">
      <label>休憩時間</label>
      <span className="time-display">{formatBreakTime(Number(pickerValue.breakTime))}</span>
      
      <div 
        className="time-picker-wrapper"
        onTouchMove={handleTouchMove}
      >
        <div className="picker-highlight"></div>
        
        {!disabled && (
          // 型エラーを回避するため、スタイルプロパティを完全に削除し、CSSクラスに依存
          <Picker
            value={pickerValue}
            onChange={handlePickerChange}
            height={90}
            itemHeight={30}
            wheelMode="normal"
          >
            <Picker.Column name="breakTime">
              {breakTimeOptions.map(minutes => (
                <Picker.Item 
                  key={minutes} 
                  value={String(minutes)}
                >
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