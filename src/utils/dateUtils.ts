/**
 * 現在の日付をYYYY-MM-DD形式で返す
 */
export const getCurrentDate = (): string => {
    const today = new Date();
    return formatDate(today);
  };
  
  /**
   * 日付をYYYY-MM-DD形式にフォーマットする
   */
  export const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  /**
   * MM/DD形式の日付を返す
   */
  export const formatShortDate = (dateString: string): string => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  };
  
  /**
   * 指定された日付が2日以上前かどうかをチェックする
   */
  export const isDateTooOld = (dateString: string): boolean => {
    const selectedDate = new Date(dateString);
    const today = new Date();
    
    // 時間部分をリセットして日付だけを比較
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);
    
    // 日付の差を計算（ミリ秒→日）
    const timeDiff = today.getTime() - selectedDate.getTime();
    const diffDays = Math.floor(timeDiff / (1000 * 3600 * 24));
    
    return diffDays > 2;
  };
  
  /**
   * 日付が許容範囲内かどうかチェックする
   * 現在より2日前から当日までが有効
   */
  export const isDateInValidRange = (dateString: string): boolean => {
    const selectedDate = new Date(dateString);
    const today = new Date();
    
    // 時間部分をリセットして日付だけを比較
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);
    
    // 日付の差を計算（ミリ秒→日）
    const timeDiff = today.getTime() - selectedDate.getTime();
    const diffDays = Math.floor(timeDiff / (1000 * 3600 * 24));
    
    // 2日前から当日（0以上2以下）
    return diffDays >= 0 && diffDays <= 2;
  };
  
  /**
   * 日付に曜日を追加した文字列を返す（例：2025/04/15（火））
   */
  export const formatDateWithWeekday = (dateString: string): string => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // 曜日の配列（日本語）
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    
    return `${year}/${month}/${day}（${weekday}）`;
  };
  
  /**
   * 曜日のみを返す（例：月）
   */
  export const getWeekdayName = (dateString: string): string => {
    const date = new Date(dateString);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return weekdays[date.getDay()];
  };
  
  /**
   * 選択可能な日付の配列を取得する（今日から2日前まで）
   */
  export const getSelectableDates = (): {value: string, label: string}[] => {
    const today = new Date();
    const dates = [];
    
    for (let i = 0; i <= 2; i++) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const dateString = formatDate(date);
      const formattedDate = formatDateWithWeekday(dateString);
      
      dates.push({
        value: dateString,
        label: formattedDate
      });
    }
    
    return dates;
  };
  
  /**
   * 時間が正しいフォーマット（HH:MM）かチェックする
   */
  export const isValidTimeFormat = (time: string): boolean => {
    return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
  };
  
  /**
   * 2つの時間を比較する（time1 <= time2 ならtrue）
   */
  export const isTimeBeforeOrEqual = (time1: string, time2: string): boolean => {
    if (!isValidTimeFormat(time1) || !isValidTimeFormat(time2)) {
      return false;
    }
    
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);
    
    if (hours1 < hours2) {
      return true;
    } else if (hours1 === hours2) {
      return minutes1 <= minutes2;
    }
    
    return false;
  };