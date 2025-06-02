/** 
 * /src/components/KintaiForm.tsx
 * 2025-01-27T10:00+09:00
 * 変更概要: 勤務時間の自動計算機能を追加 - 出勤時間、退勤時間、休憩時間から勤務時間を計算してリアルタイム表示
 */
import React, { useState, useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import MobileDatePicker from './MobileDatePicker';
import MobileTimePicker from './MobileTimePicker';
import MobileBreakPicker from './MobileBreakPicker';
import { 
  KintaiFormState, 
  EditActionType,
  ValidationErrors,
  KintaiData 
} from '../types';
import { 
  getCurrentDate, 
  isDateTooOld,
  isTimeBeforeOrEqual,
  getSelectableDates
} from '../utils/dateUtils';
import { 
  saveKintaiToServer, 
  isAuthenticated, 
  isEnteredDate,
  getKintaiDataByDate 
} from '../utils/apiService';

// 初期状態
const initialState: KintaiFormState = {
  date: getCurrentDate(),
  startTime: '',
  breakTime: '', // データがない場合は空文字（空表示）
  endTime: '',
  location: '',
  isSaved: false,
  isEditing: false,
  touchStartTime: 0
};

// 編集アクション処理用reducer
const editReducer = (state: KintaiFormState, action: { type: EditActionType; payload?: any }): KintaiFormState => {
  switch (action.type) {
    case EditActionType.TOUCH_START:
      return {
        ...state,
        touchStartTime: Date.now()
      };
    case EditActionType.TOUCH_END:
      const touchDuration = Date.now() - state.touchStartTime;
      // 1秒以上の長押しで編集モードに
      if (touchDuration >= 1000 && !state.isEditing) {
        return {
          ...state,
          isEditing: true,
          touchStartTime: 0
        };
      }
      return {
        ...state,
        touchStartTime: 0
      };
    case EditActionType.CANCEL_EDIT:
      return {
        ...state,
        isEditing: false
      };
    case EditActionType.SAVE_COMPLETE:
      return {
        ...state,
        isSaved: true,
        isEditing: false
      };
    case EditActionType.DATE_CHANGE:
      return {
        ...state,
        date: action.payload,
        isSaved: false
      };
    case EditActionType.CHECK_SAVED:
      return {
        ...state,
        isSaved: action.payload
      };
    default:
      return state;
  }
};

// 勤務時間を計算する関数
const calculateWorkingTime = (startTime: string, endTime: string, breakTime: string): string => {
  // 入力値が不完全な場合は空文字を返す
  if (!startTime || !endTime) {
    return '';
  }

  try {
    // 時間文字列をパース
    const parseTime = (timeStr: string): { hours: number; minutes: number } | null => {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
      return { hours, minutes };
    };

    const start = parseTime(startTime);
    const end = parseTime(endTime);
    
    if (!start || !end) {
      return '';
    }

    // 分単位に変換
    const startMinutes = start.hours * 60 + start.minutes;
    let endMinutes = end.hours * 60 + end.minutes;
    
    // 日をまたぐ場合の処理（退勤時間が出勤時間より早い場合）
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60; // 翌日として計算
    }

    // 休憩時間を分単位に変換
    let breakMinutes = 0;
    if (breakTime) {
      const breakParsed = parseTime(breakTime);
      if (breakParsed) {
        breakMinutes = breakParsed.hours * 60 + breakParsed.minutes;
      }
    }

    // 勤務時間を計算（総時間 - 休憩時間）
    const workingMinutes = endMinutes - startMinutes - breakMinutes;
    
    // 負の値の場合は0:00を返す
    if (workingMinutes < 0) {
      return '0:00';
    }

    // 時:分形式に変換
    const hours = Math.floor(workingMinutes / 60);
    const minutes = workingMinutes % 60;
    
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  } catch (error) {
      return '';
    }
};

// formatTimeToHHMM ヘルパー関数は apiService 側で処理するため削除

const KintaiForm: React.FC = () => {
  const navigate = useNavigate();
  
  // ユーザー認証チェック
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
    }
  }, [navigate]);
  
  // フォーム状態管理
  const [formState, dispatch] = useReducer(editReducer, initialState);
  
  // フォーム値とバリデーション
  const [startTime, setStartTime] = useState(initialState.startTime);
  const [breakTime, setBreakTime] = useState<string>(initialState.breakTime);
  const [endTime, setEndTime] = useState(initialState.endTime);
  const [location, setLocation] = useState(initialState.location);
  const [workingTime, setWorkingTime] = useState(''); // 勤務時間の状態を追加
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false); // ← これを有効化
  const [] = useState(false); // handleSave で使用 (isSubmittingと役割が近い場合は統一を検討)
  const [tooOldDateWarning, setTooOldDateWarning] = useState(false);
  
  
  // 選択可能な日付の取得
  const selectableDates = getSelectableDates();
  
  // 勤務時間の自動計算
  useEffect(() => {
    const calculatedWorkingTime = calculateWorkingTime(startTime, endTime, breakTime);
    setWorkingTime(calculatedWorkingTime);
  }, [startTime, endTime, breakTime]);
  
  // 日付に入力済みフラグチェック
  
  // 日付変更時
  useEffect(() => {
    const loadDateInfo = async () => {
      setErrors({}); // 日付変更時にエラーをリセット
      try {
        const entered = await isEnteredDate(new Date(formState.date));
        
        if (entered) {
          const data = await getKintaiDataByDate(formState.date);

          if (data) {
            // データの詳細をログ出力
            
            // 出勤時間が入力されている場合のみ保存済みとして扱う
            // 空文字や未定義は未入力として扱う
            const hasStartTime = data.startTime && data.startTime.trim() !== '';
            dispatch({ type: EditActionType.CHECK_SAVED, payload: hasStartTime });
            
            // apiService から "HH:mm" 形式で渡ってくることを期待
            setStartTime(data.startTime !== undefined ? data.startTime : initialState.startTime);
            
            // apiService から "HH:mm" 形式で渡ってくることを期待
            // breakTime の処理 - undefinedの場合は空文字を使用（空表示のため）
            let breakTimeAsString = ''; 
            if (data.breakTime !== undefined && typeof data.breakTime === 'string') {
                breakTimeAsString = data.breakTime;
                // 休憩時間を文字列として設定
            } else if (data.breakTime !== undefined) {
                // 万が一文字列でない場合 (apiServiceの変換が失敗した場合など)
                // 休憩時間が文字列でない場合は空文字に設定
            } else {
                // 休憩時間がundefinedのため空文字に設定
            }
            // data.breakTime が undefined の場合は空文字を使用（空表示）
            setBreakTime(breakTimeAsString);

            // apiService から "HH:mm" 形式で渡ってくることを期待
            setEndTime(data.endTime !== undefined ? data.endTime : initialState.endTime);
            setLocation(data.location !== undefined ? data.location : initialState.location);
            // 保存済みデータの場合は、サーバーから取得した勤務時間を使用
            setWorkingTime(data.workingTime || '');

            // フォームに値を設定完了

          } else {
          dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
          setStartTime(initialState.startTime);
          setBreakTime(initialState.breakTime);
          setEndTime(initialState.endTime);
          setLocation(initialState.location);
          setWorkingTime(''); // 勤務時間もリセット
          }
        } else {
        dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
        setStartTime(initialState.startTime);
        setBreakTime(initialState.breakTime);
        setEndTime(initialState.endTime);
        setLocation(initialState.location);
        setWorkingTime(''); // 勤務時間もリセット
        }
      } catch (error) {
      setErrors({ general: 'データの読み込みに失敗しました。' });
      setStartTime(initialState.startTime);
      setBreakTime(initialState.breakTime);
      setEndTime(initialState.endTime);
      setLocation(initialState.location);
      setWorkingTime(''); // 勤務時間もリセット
      }
      
      const isOldDate = isDateTooOld(formState.date);
      setTooOldDateWarning(isOldDate);
    };
    
    if (formState.date) { 
      loadDateInfo();
    }
  }, [formState.date]);
  
  // 入力値変更ハンドラー
  const handleDateChange = (date: string) => {
    dispatch({ type: EditActionType.DATE_CHANGE, payload: date });
  };
  
  const handleStartTimeChange = (time: string) => {
    setStartTime(time);
    validateForm({
      date: formState.date,
      startTime: time,
      breakTime,
      endTime,
      location
    });
  };
  
  const handleBreakTimeChange = (timeString: string) => {
    setBreakTime(timeString);
    validateForm({
      date: formState.date,
      startTime,
      breakTime: timeString,
      endTime,
      location
    });
  };
  
  const handleEndTimeChange = (time: string) => {
    setEndTime(time);
    validateForm({
      date: formState.date,
      startTime,
      breakTime,
      endTime: time,
      location
    });
  };
  
  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocation(e.target.value);
  };
  
  // フォーム検証
  const validateForm = (data: KintaiData): boolean => {
    const newErrors: ValidationErrors = {};
    
    // 出勤時間が退勤時間より前かチェック
    if (!isTimeBeforeOrEqual(data.startTime, data.endTime)) {
      newErrors.endTime = '退勤時間は出勤時間より後にしてください';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // 送信ハンドラー
  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    const formData: KintaiData = {
      date: formState.date,
      startTime,
      breakTime,
      endTime,
      location
    };
    
    const isValid = validateForm(formData);
    
    if (isValid) {
      try {
        const result = await saveKintaiToServer(formData);
        
        if (result.success) {
          dispatch({ type: EditActionType.SAVE_COMPLETE });
        } else {
          setErrors({ general: result.error || 'エラーが発生しました' });
        }
      } catch (error) {
        setErrors({ general: '保存中にエラーが発生しました' });
      }
    }
    
    setIsSubmitting(false);
  };
  
  // 編集キャンセル
  const handleCancelEdit = () => {
    dispatch({ type: EditActionType.CANCEL_EDIT });
  };
  
  // 長押し処理
  const handleLongPressStart = () => {
    dispatch({ type: EditActionType.TOUCH_START });
  };
  
  const handleLongPressEnd = () => {
    dispatch({ type: EditActionType.TOUCH_END });
  };
  
  // 古い日付かどうかの判定
  const isVeryOldDate = (): boolean => {
    return isDateTooOld(formState.date);
  };
  
  // ボタンのクラス名を取得
  const getButtonClassName = (): string => {
    if (isVeryOldDate()) {
      return 'btn btn-disabled';
    }
    return 'btn btn-saved';
  };
  
  // ボタンのテキストを取得
  const getSaveButtonText = (): string => {
    if (isVeryOldDate()) {
      return '編集不可（3日以上前）';
    }
    return '長押しで編集';
  };
  
  return (
    <div className="kintai-form">
      {/* 日付選択 */}
      <MobileDatePicker 
        value={formState.date} 
        onChange={handleDateChange} 
        selectableDates={selectableDates}
      />
      
      {/* 古い日付の警告 */}
      {tooOldDateWarning && (
        <div className="warning-message">
          ⚠️ 3日以上前の日付は編集できません
        </div>
      )}
      
      {/* 出勤時間 */}
        <MobileTimePicker 
          label="出勤時間" 
          value={startTime} 
          onChange={handleStartTimeChange} 
          disabled={(formState.isSaved && !formState.isEditing) || isVeryOldDate()}
        />
        {errors.startTime && <div className="error-message">{errors.startTime}</div>}
        
        {/* 休憩時間 */}
        <MobileBreakPicker
          value={breakTime}
          onChange={handleBreakTimeChange}
          disabled={(formState.isSaved && !formState.isEditing) || isVeryOldDate()}
        />
        {errors.breakTime && <div className="error-message">{errors.breakTime}</div>}
        
        {/* 退勤時間 */}
        <MobileTimePicker 
          label="退勤時間" 
          value={endTime} 
          onChange={handleEndTimeChange} 
          disabled={(formState.isSaved && !formState.isEditing) || isVeryOldDate()}
        />
        {errors.endTime && <div className="error-message">{errors.endTime}</div>}
        
        {/* 勤務時間 */}
        <div className="form-group">
          <label>勤務時間</label>
          <div className="time-display working-time-display">
            {workingTime || (formState.isSaved && !formState.isEditing ? '-' : '0:00')}
          </div>
        </div>
        
        {/* 勤務場所 */}
        <div className="form-group">
          <label>勤務場所</label>
          <select 
            value={location} 
            onChange={handleLocationChange}
            disabled={(formState.isSaved && !formState.isEditing) || isVeryOldDate()}
            className={`location-select ${!((formState.isSaved && !formState.isEditing) || isVeryOldDate()) ? 'location-input-enabled' : ''}`}
          >
            <option value="">未選択</option>
            <option value="田んぼ">田んぼ</option>
            <option value="柿農園">柿農園</option>
            <option value="事務所">事務所</option>
            <option value="その他">その他</option>
          </select>
        </div>
      
      {/* エラーメッセージ */}
      {errors.general && <div className="error-message">{errors.general}</div>}
      
      {/* 保存/編集ボタン */}
      <div className="button-container">
        {formState.isEditing ? (
          <>
            <button 
              className="btn btn-edit" 
              onClick={handleSubmit}
              disabled={isSubmitting || Object.keys(errors).length > 0 || isVeryOldDate()}
            >
              保存する
            </button>
            <button 
              className="btn" 
              onClick={handleCancelEdit}
              style={{ marginTop: '8px', backgroundColor: '#9e9e9e' }}
              disabled={isSubmitting}
            >
              キャンセル
            </button>
          </>
        ) : formState.isSaved ? (
          <button 
            className={getButtonClassName()}
            onTouchStart={isVeryOldDate() ? undefined : handleLongPressStart}
            onTouchEnd={isVeryOldDate() ? undefined : handleLongPressEnd}
            onMouseDown={isVeryOldDate() ? undefined : handleLongPressStart}
            onMouseUp={isVeryOldDate() ? undefined : handleLongPressEnd}
            onMouseLeave={isVeryOldDate() ? undefined : handleLongPressEnd}
            disabled={isSubmitting || isVeryOldDate()}
          >
            {getSaveButtonText()}
          </button>
        ) : (
          <button 
            className="btn btn-edit" 
            onClick={handleSubmit}
            disabled={isSubmitting || Object.keys(errors).length > 0 || isVeryOldDate()}
          >
            保存する
          </button>
        )}
      </div>
    </div>
  );
};

export default KintaiForm;