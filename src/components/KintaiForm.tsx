/** 
 * /src/components/KintaiForm.tsx
 * 2025-05-05T15:45+09:00
 * 変更概要: 更新 - ヘッダー部分を共通Headerコンポーネントに移行、ユーザー情報表示の削除
 */
import React, { useState, useEffect, useCallback, useReducer } from 'react';
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
import { saveKintaiToServer, isAuthenticated, isEnteredDate } from '../utils/apiService';

// 初期状態
const initialState: KintaiFormState = {
  date: getCurrentDate(),
  startTime: '9:00',
  breakTime: 60, // 60分
  endTime: '18:00',
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
  const [breakTime, setBreakTime] = useState(initialState.breakTime);
  const [endTime, setEndTime] = useState(initialState.endTime);
  const [location, setLocation] = useState(initialState.location);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tooOldDateWarning, setTooOldDateWarning] = useState(false);
  
  // 選択可能な日付の取得
  const selectableDates = getSelectableDates();
  
  // 日付に入力済みフラグチェック
  const checkDateEntered = useCallback(async (date: string) => {
    try {
      const entered = await isEnteredDate(new Date(date));
      dispatch({ type: EditActionType.CHECK_SAVED, payload: entered });
    } catch (error) {
      console.error('日付チェックエラー:', error);
    }
  }, []);
  
  // 日付変更時
  useEffect(() => {
    const loadDateInfo = async () => {
      await checkDateEntered(formState.date);
      
      // 古い日付の警告
      const isOldDate = isDateTooOld(formState.date);
      setTooOldDateWarning(isOldDate);
    };
    
    loadDateInfo();
  }, [formState.date, checkDateEntered]);
  
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
  
  const handleBreakTimeChange = (minutes: number) => {
    setBreakTime(minutes);
    validateForm({
      date: formState.date,
      startTime,
      breakTime: minutes,
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
        console.error('保存エラー:', error);
      }
    }
    
    setIsSubmitting(false);
  };
  
  // 編集モード切り替えハンドラー
  const handleLongPressStart = () => {
    dispatch({ type: EditActionType.TOUCH_START });
  };
  
  const handleLongPressEnd = () => {
    dispatch({ type: EditActionType.TOUCH_END });
  };
  
  const handleCancelEdit = () => {
    dispatch({ type: EditActionType.CANCEL_EDIT });
    // 値を元に戻す
    setStartTime(initialState.startTime);
    setBreakTime(initialState.breakTime);
    setEndTime(initialState.endTime);
    setLocation(initialState.location);
    setErrors({});
  };
  
  // 保存ボタンのテキスト
  const getSaveButtonText = () => {
    if (isSubmitting) {
      return '保存中...';
    }
    
    if (formState.isSaved) {
      return (
        <span className="saved-message">
          この日のデータは保存済みです
          <span className="hint-text">長押しで編集できます</span>
        </span>
      );
    }
    
    return '保存する';
  };
  
  // ボタンのクラス名
  const getButtonClassName = () => {
    let className = 'btn btn-press-effect';
    
    if (formState.isSaved && !formState.isEditing) {
      className += ' btn-saved';
    } else if (formState.isEditing) {
      className += ' btn-edit';
    }
    
    if (formState.touchStartTime > 0) {
      className += ' btn-pressing';
    }
    
    return className;
  };
  
  return (
    <div className="kintai-form">
      {/* 古い日付警告 */}
      {tooOldDateWarning && (
        <div className="error-box message-box">
          2日以上前の日付のため、保存できない場合があります
        </div>
      )}
      
      {/* 日付選択 */}
      <div className="form-group form-group-horizontal">
        <label>日付</label> {/* Add label here */} 
        <MobileDatePicker 
          value={formState.date}
          onChange={handleDateChange}
          disabled={!formState.isEditing}
          selectableDates={selectableDates}
        />
      </div>
      
      {/* 出勤時間 */}
      <div className={formState.isEditing ? '' : 'disabled-form'}>
        <MobileTimePicker 
          label="出勤時間" 
          value={startTime} 
          onChange={handleStartTimeChange} 
          disabled={!formState.isEditing}
        />
        {errors.startTime && <div className="error-message">{errors.startTime}</div>}
        
        {/* 休憩時間 */}
        <MobileBreakPicker
          value={breakTime}
          onChange={handleBreakTimeChange}
          disabled={!formState.isEditing}
        />
        {errors.breakTime && <div className="error-message">{errors.breakTime}</div>}
        
        {/* 退勤時間 */}
        <MobileTimePicker 
          label="退勤時間" 
          value={endTime} 
          onChange={handleEndTimeChange} 
          disabled={!formState.isEditing}
        />
        {errors.endTime && <div className="error-message">{errors.endTime}</div>}
        
        {/* 勤務場所 */}
        <div className="form-group">
          <label>勤務場所</label>
          <select 
            value={location} 
            onChange={handleLocationChange}
            disabled={!formState.isEditing}
            className="location-select"
          >
            <option value="">選択してください</option>
            <option value="田んぼ">田んぼ</option>
            <option value="柿農園">柿農園</option>
            <option value="事務所">事務所</option>
            <option value="その他">その他</option>
          </select>
        </div>
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
              disabled={isSubmitting || Object.keys(errors).length > 0}
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
        ) : (
          <button 
            className={getButtonClassName()}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            onMouseDown={handleLongPressStart}
            onMouseUp={handleLongPressEnd}
            onMouseLeave={handleLongPressEnd}
            disabled={isSubmitting}
          >
            {getSaveButtonText()}
          </button>
        )}
      </div>
    </div>
  );
};

export default KintaiForm;