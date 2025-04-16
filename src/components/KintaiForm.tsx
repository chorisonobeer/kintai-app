import React, { useState, useEffect, useReducer, useCallback } from 'react';
import MobileTimePicker from './MobileTimePicker';
import MobileBreakPicker from './MobileBreakPicker';
import MobileDatePicker from './MobileDatePicker';
import { KintaiData, ValidationErrors, KintaiFormState, EditActionType } from '../types';
import { 
  getCurrentDate, 
  isDateTooOld, 
  isTimeBeforeOrEqual, 
  formatShortDate,
  getWeekdayName 
} from '../utils/dateUtils';
import { saveKintaiData, getKintaiData, isDateSaved } from '../utils/storageUtils';
import { saveKintaiToServer, getUserName, logout } from '../utils/apiService';

// 初期状態
const initialState: KintaiFormState = {
  isSaved: false,
  isEditing: false,
  touchStartTime: 0
};

// 長押し検出のための時間（ミリ秒）
const LONG_PRESS_DURATION = 700;

// 編集状態の reducer
function formStateReducer(state: KintaiFormState, action: { type: EditActionType, payload?: any }) {
  switch (action.type) {
    case EditActionType.TOUCH_START:
      return { ...state, touchStartTime: Date.now() };
    
    case EditActionType.TOUCH_END:
      // 長押しだった場合、編集モードに入る
      const pressDuration = Date.now() - state.touchStartTime;
      if (pressDuration >= LONG_PRESS_DURATION && state.isSaved) {
        return { ...state, isEditing: true, touchStartTime: 0 };
      }
      return { ...state, touchStartTime: 0 };
    
    case EditActionType.CANCEL_EDIT:
      return { ...state, isEditing: false };
    
    case EditActionType.SAVE_COMPLETE:
      return { ...state, isSaved: true, isEditing: false };
    
    case EditActionType.DATE_CHANGE:
      return { 
        ...state, 
        isSaved: action.payload?.isSaved || false,
        isEditing: false
      };
    
    case EditActionType.CHECK_SAVED:
      return { ...state, isSaved: action.payload?.isSaved || false };
    
    default:
      return state;
  }
}

interface KintaiFormProps {
  onLogout?: () => void;
}

const KintaiForm: React.FC<KintaiFormProps> = ({ onLogout }) => {
  // フォームデータの状態
  const [formData, setFormData] = useState<KintaiData>({
    date: getCurrentDate(),
    startTime: '09:00',
    breakTime: 60,
    endTime: '18:00',
    location: ''
  });

  // バリデーションエラーの状態
  const [errors, setErrors] = useState<ValidationErrors>({});
  
  // 編集不可状態（2日以上前）
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);
  
  // 保存状態と編集モードの管理
  const [formState, dispatch] = useReducer(formStateReducer, initialState);
  
  // ボタンのプレス状態
  const [isPressing, setIsPressing] = useState<boolean>(false);

  // サーバー通信状態
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<{text: string, isError: boolean} | null>(null);

  // ユーザー名の取得
  const userName = getUserName();

  // 初期ロード時と日付変更時にデータをロード
  useEffect(() => {
    loadSavedData(formData.date);
    checkDateSavedStatus(formData.date);
  }, [formData.date]);

  // 日付が変更されたときに2日以上前かどうかチェックする
  useEffect(() => {
    const isTooOld = isDateTooOld(formData.date);
    setIsFormDisabled(isTooOld);
    
    if (isTooOld) {
      setErrors(prev => ({ ...prev, date: '2日以上前の日付は編集できません' }));
    } else {
      setErrors(prev => {
        const { date, ...rest } = prev;
        return rest;
      });
    }
  }, [formData.date]);

  // 時間が変更されたときにバリデーションを実行
  useEffect(() => {
    validateTimeOrder();
  }, [formData.startTime, formData.endTime]);

  // 保存済みデータをロード
  const loadSavedData = useCallback((date: string) => {
    const savedData = getKintaiData(date);
    if (savedData) {
      setFormData(savedData);
    } else {
      // デフォルト値をセット
      setFormData({
        date,
        startTime: '09:00',
        breakTime: 60,
        endTime: '18:00',
        location: ''
      });
    }
  }, []);

  // 日付の保存状態をチェック
  const checkDateSavedStatus = useCallback((date: string) => {
    const saved = isDateSaved(date);
    dispatch({ type: EditActionType.DATE_CHANGE, payload: { isSaved: saved } });
  }, []);

  // 日付変更ハンドラー
  const handleDateChange = (date: string) => {
    setFormData(prev => ({ ...prev, date }));
    checkDateSavedStatus(date);
  };

  // 時間変更ハンドラー
  const handleStartTimeChange = (time: string) => {
    setFormData(prev => ({ ...prev, startTime: time }));
  };

  const handleBreakTimeChange = (minutes: number) => {
    setFormData(prev => ({ ...prev, breakTime: minutes }));
  };

  const handleEndTimeChange = (time: string) => {
    setFormData(prev => ({ ...prev, endTime: time }));
  };
  
  // 時間の順序バリデーション
  const validateTimeOrder = () => {
    if (formData.startTime && formData.endTime) {
      if (!isTimeBeforeOrEqual(formData.startTime, formData.endTime)) {
        setErrors(prev => ({ ...prev, general: '退勤時刻は出勤時刻より後である必要があります' }));
      } else {
        setErrors(prev => {
          const { general, ...rest } = prev;
          return rest;
        });
      }
    }
  };

  // フォームバリデーション
  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};
    
    if (!formData.date) {
      newErrors.date = '日付を入力してください';
    } else if (isDateTooOld(formData.date)) {
      newErrors.date = '2日以上前の日付は編集できません';
    }
    
    if (!formData.startTime) {
      newErrors.startTime = '出勤時刻を入力してください';
    }
    
    if (!formData.endTime) {
      newErrors.endTime = '退勤時刻を入力してください';
    }
    
    if (formData.startTime && formData.endTime && 
        !isTimeBeforeOrEqual(formData.startTime, formData.endTime)) {
      newErrors.general = '退勤時刻は出勤時刻より後である必要があります';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // フォーム送信ハンドラー
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    // UI状態の更新
    setIsSaving(true);
    setSaveMessage(null);

    try {
      // データをローカルストレージに保存
      saveKintaiData(formData);
      
      // データをサーバーに送信
      const result = await saveKintaiToServer(formData);
      
      if (result.success) {
        // 保存完了状態に更新
        dispatch({ type: EditActionType.SAVE_COMPLETE });
        setSaveMessage({ text: '勤怠データを保存しました', isError: false });
      } else {
        setSaveMessage({ text: result.error || 'サーバーへの保存に失敗しました', isError: true });
      }
    } catch (error) {
      console.error('Save error:', error);
      setSaveMessage({ text: '通信エラーが発生しました', isError: true });
    } finally {
      setIsSaving(false);
    }
    
    // ユーザーに通知
    console.log('送信データ:', formData);
  };

  // 長押し関連のハンドラー
  const handleTouchStart = () => {
    dispatch({ type: EditActionType.TOUCH_START });
    setIsPressing(true);
    
    // タイマーを設定して視覚的フィードバックを管理
    const timer = setTimeout(() => {
      if (formState.isSaved) {
        // バイブレーション（対応デバイスのみ）
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }
    }, LONG_PRESS_DURATION);
    
    return () => clearTimeout(timer);
  };

  const handleTouchEnd = () => {
    dispatch({ type: EditActionType.TOUCH_END });
    setIsPressing(false);
  };

  // 編集モードのキャンセル
  const handleCancelEdit = () => {
    dispatch({ type: EditActionType.CANCEL_EDIT });
    loadSavedData(formData.date);
  };

  // ログアウト処理
  const handleLogout = async () => {
    if (onLogout) {
      await logout();
      onLogout();
    }
  };

  // 保存ボタンのテキストとスタイルを決定
  const getButtonConfig = () => {
    // 保存済みで編集モードでない場合
    if (formState.isSaved && !formState.isEditing) {
      const shortDate = formatShortDate(formData.date);
      const weekday = getWeekdayName(formData.date);
      return {
        text: (
          <>
            <span className="saved-message">{shortDate}({weekday})は保存済み</span>
            <span className="hint-text">編集する場合は長押し</span>
          </>
        ),
        className: 'btn btn-saved btn-press-effect',
        onClick: (e: React.FormEvent) => e.preventDefault(),
        isDisabled: false
      };
    }
    
    // 編集モード中
    if (formState.isEditing) {
      return {
        text: '更新',
        className: 'btn btn-edit',
        onClick: handleSubmit,
        isDisabled: isFormDisabled || Object.keys(errors).length > 0 || isSaving
      };
    }
    
    // 通常の保存モード
    return {
      text: isSaving ? '保存中...' : '保存',
      className: 'btn',
      onClick: handleSubmit,
      isDisabled: isFormDisabled || Object.keys(errors).length > 0 || isSaving
    };
  };

  const buttonConfig = getButtonConfig();
  const pressingClass = isPressing ? 'btn-pressing' : '';

  return (
    <div className="kintai-form">
      {/* ユーザー情報とログアウトボタン */}
      {userName && (
        <div className="user-info">
          <span className="user-name">{userName}</span>
          <button 
            type="button" 
            className="logout-button"
            onClick={handleLogout}
          >
            ログアウト
          </button>
        </div>
      )}
      
      {isFormDisabled && (
        <div className="disabled-message">
          2日以上前の日付は編集できません
        </div>
      )}
      
      {saveMessage && (
        <div className={`message-box ${saveMessage.isError ? 'error-box' : 'success-box'}`}>
          {saveMessage.text}
        </div>
      )}
      
      <form onSubmit={buttonConfig.onClick} className={isFormDisabled ? 'disabled-form' : ''}>
        <div className="picker-container">
          {/* 日付ピッカー */}
          <MobileDatePicker
            value={formData.date}
            onChange={handleDateChange}
            disabled={isFormDisabled || (formState.isSaved && !formState.isEditing)}
          />
          {errors.date && <div className="error-message">{errors.date}</div>}
          
          {/* 出勤時刻 */}
          <MobileTimePicker
            label="出勤時刻"
            value={formData.startTime}
            onChange={handleStartTimeChange}
            disabled={isFormDisabled || (formState.isSaved && !formState.isEditing)}
          />
          {errors.startTime && <div className="error-message">{errors.startTime}</div>}
          
          {/* 休憩時間 */}
          <MobileBreakPicker
            value={formData.breakTime}
            onChange={handleBreakTimeChange}
            disabled={isFormDisabled || (formState.isSaved && !formState.isEditing)}
          />
          
          {/* 退勤時刻 */}
          <MobileTimePicker
            label="退勤時刻"
            value={formData.endTime}
            onChange={handleEndTimeChange}
            disabled={isFormDisabled || (formState.isSaved && !formState.isEditing)}
          />
          {errors.endTime && <div className="error-message">{errors.endTime}</div>}
          
          {errors.general && <div className="error-message">{errors.general}</div>}
          
          {formState.isEditing && (
            <div className="button-container">
              <button 
                type="button"
                className="btn"
                onClick={handleCancelEdit}
              >
                キャンセル
              </button>
            </div>
          )}
        </div>
        
        <div className="button-container">
          <button
            type="submit"
            className={`${buttonConfig.className} ${pressingClass}`}
            disabled={buttonConfig.isDisabled}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
          >
            {buttonConfig.text}
          </button>
        </div>
      </form>
    </div>
  );
};

export default KintaiForm;