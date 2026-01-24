
import React, { useState, useMemo, useEffect } from 'react';
import { DailyRecord, FoodDef, AppSettings } from '../types';
import { calculateDailyStats, markRecordsAsBackedUp } from '../services/storage';
import { Calendar as CalendarIcon, AlertTriangle, Scale, X, CloudUpload, Cookie, ChevronLeft, ChevronRight, Flame, Droplet, Loader2, Check } from 'lucide-react';

interface Props {
  records: DailyRecord[];
  foods: FoodDef[];
  settings: AppSettings;
  onSelectDate: (date: string) => void;
  onRefresh: () => Promise<void>;
}

const URINE_ANCHORS = ['1元', '50元', '半拳', '一拳', '巨大'];
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx9LlsY_4-J-7ZVDxDXQEMdV6RnDghlVK8YZXMtJlk1l8KBnmbhnEtAI1frsqD8NKWe/exec";

// Helper moved outside to allow state initialization
const formatDateString = (date: Date): string => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - (offset * 60 * 1000));
  return local.toISOString().split('T')[0];
};

const HistoryView: React.FC<Props> = ({ records, foods, settings, onSelectDate, onRefresh }) => {
  // --- Export/Backup State ---
  const [showBackupModal, setShowBackupModal] = useState(false);
  
  // Initialize with default range (1st of month to Today) so the button can reflect status immediately
  const [backupStartDate, setBackupStartDate] = useState(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return formatDateString(firstDay);
  });
  const [backupEndDate, setBackupEndDate] = useState(() => {
    return formatDateString(new Date());
  });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  // --- Calendar State ---
  const [currentMonth, setCurrentMonth] = useState(new Date());
  // Default selected date to today or the latest record date
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Initialize selectedDate on load
  useEffect(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
    
    if (!selectedDate) {
        setSelectedDate(localToday);
    }
  }, []);

  // --- Helpers ---

  const getUrineValue = (label: string): number => {
    const exactIndex = URINE_ANCHORS.indexOf(label);
    if (exactIndex !== -1) return exactIndex;

    if (label.includes(' ~ ')) {
      const parts = label.split(' ~ ');
      const startIdx = URINE_ANCHORS.indexOf(parts[0]);
      if (startIdx !== -1) return startIdx + 0.5;
    }
    return 2; 
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { days, firstDay, year, month };
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentMonth(newDate);
  };

  // Build a map of date -> active weight
  const dailyWeightMap = useMemo(() => {
    const map = new Map<string, number>();
    const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
    
    let lastKnownWeight = 5.0;

    sortedRecords.forEach(r => {
        if (r.weight > 0) {
            lastKnownWeight = r.weight;
        }
        map.set(r.date, lastKnownWeight);
    });
    
    return map;
  }, [records]);

  // Build a map of date -> days since last litter change
  const dailyLitterAgeMap = useMemo(() => {
    const map = new Map<string, number>();
    const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
    
    let lastLitterDate: string | null = null;

    sortedRecords.forEach(r => {
        const hasLitterChange = r.notes && r.notes.includes('換砂');
        if (hasLitterChange) {
            lastLitterDate = r.date;
            map.set(r.date, 0);
        } else if (lastLitterDate) {
            const d1 = new Date(r.date);
            const d2 = new Date(lastLitterDate);
            const diffTime = Math.abs(d1.getTime() - d2.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            map.set(r.date, diffDays);
        } else {
            map.set(r.date, -1);
        }
    });

    return map;
  }, [records]);

  // Build a map of date -> days since last medication
  const dailyMedicationAgeMap = useMemo(() => {
    const map = new Map<string, number>();
    const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
    
    let lastMedDate: string | null = null;

    sortedRecords.forEach(r => {
        const hasMedication = r.notes && r.notes.includes('點藥');
        if (hasMedication) {
            lastMedDate = r.date;
            map.set(r.date, 0);
        } else if (lastMedDate) {
            const d1 = new Date(r.date);
            const d2 = new Date(lastMedDate);
            const diffTime = Math.abs(d1.getTime() - d2.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            map.set(r.date, diffDays);
        } else {
            map.set(r.date, -1);
        }
    });

    return map;
  }, [records]);

  const indicatorsMap = useMemo(() => {
    const map: Record<string, { pink: boolean, green: boolean, yellow: boolean, orange: boolean, blue: boolean }> = {};
    
    records.forEach(r => {
        const stats = calculateDailyStats(r, foods);
        const sideRatio = stats.totalCalories > 0 ? (stats.sideCalories / stats.totalCalories) : 0;
        const urineVal = getUrineValue(r.urineSize);
        
        const historicalWeight = dailyWeightMap.get(r.date) || 5.0;
        const historicalWaterGoal = historicalWeight * 40;

        map[r.date] = {
            pink: stats.totalWater < historicalWaterGoal,
            green: urineVal <= 1.5,
            yellow: sideRatio > 0.1,
            orange: r.stoolStatus !== '正常',
            blue: !!r.notes
        };
    });
    return map;
  }, [records, foods, dailyWeightMap]);

  const displayedRecords = useMemo(() => {
    if (!selectedDate) return [];

    const end = new Date(selectedDate);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    
    const startStr = formatDateString(start);
    const endStr = formatDateString(end);

    return records
      .filter(r => r.date >= startStr && r.date <= endStr)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records, selectedDate]);


  // --- Cloud Backup Logic ---

  const handleOpenBackup = () => {
    // Reset dates to current month range when opening
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    setBackupStartDate(formatDateString(firstDay));
    setBackupEndDate(formatDateString(today));
    
    setShowBackupModal(true);
    setUploadSuccess(false);
  };

  // Prepare records for backup and detect sync status
  const pendingBackupRecords = useMemo(() => {
      if (!backupStartDate || !backupEndDate) return [];
      
      const inRange = records.filter(r => r.date >= backupStartDate && r.date <= backupEndDate);
      
      // Filter for "Dirty" records: No backup time OR lastModified is newer than backup time
      return inRange.filter(r => {
          if (!r.lastBackupTime) return true;
          const modTime = r.lastModified || 0;
          return modTime > r.lastBackupTime;
      });
  }, [records, backupStartDate, backupEndDate]);

  const handleCloudUpload = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent accidental navigation if inside a form
    
    const filtered = records.filter(r => r.date >= backupStartDate && r.date <= backupEndDate);
    filtered.sort((a, b) => a.date.localeCompare(b.date));

    if (filtered.length === 0) {
        alert('選定的期間內沒有紀錄可上傳');
        return;
    }

    setIsUploading(true);

    try {
        const payload = filtered.map(r => {
            const stats = calculateDailyStats(r, foods);
            
            // Calculate Snack Info
            const totalCals = stats.totalCalories;
            const sideCals = stats.sideCalories;
            // Changed from toFixed(0) to toFixed(1) to match UI display and prevent 0.7% -> 1% rounding
            const ratio = totalCals > 0 ? (sideCals / totalCals * 100).toFixed(1) : "0";
            
            // Get unique snack names
            const snackNames = new Set<string>();
            if (r.foodIntakes) {
                r.foodIntakes.forEach(i => {
                    const f = foods.find(food => food.id === i.foodId);
                    if (f && (f.type === '零食' || f.type === '副食' as any)) {
                        snackNames.add(f.name);
                    }
                });
            }
            const namesStr = Array.from(snackNames).join('、');
            const snackInfoStr = namesStr ? `${ratio}%, ${namesStr}` : `${ratio}%`;

            return {
                date: r.date,
                weight: r.weight > 0 ? r.weight : "",
                totalCalories: parseFloat(stats.totalCalories.toFixed(1)),
                snackInfo: snackInfoStr,
                totalWater: parseFloat(stats.totalWater.toFixed(1)),
                urineSize: r.urineSize,
                stoolStatus: r.stoolStatus,
                notes: r.notes || ""
            };
        });

        // Use 'no-cors' mode as standard Google Apps Script Web App endpoints often have CORS issues
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8', 
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.result === 'success') {
            // Update local state to mark these records as backed up
            const idsToUpdate = filtered.map(r => r.id);
            await markRecordsAsBackedUp(idsToUpdate);
            
            // Show success and refresh data WITHOUT reloading the page
            setUploadSuccess(true);
            setTimeout(async () => {
                await onRefresh();
                setShowBackupModal(false);
                setUploadSuccess(false);
            }, 1500);
        } else {
            throw new Error(result.error || 'Upload failed');
        }

    } catch (error) {
        console.error("Upload failed", error);
        alert('上傳失敗，請檢查網路連線或稍後再試。');
    } finally {
        setIsUploading(false);
    }
  };


  const renderCalendarDays = () => {
    const { days, firstDay, year, month } = getDaysInMonth(currentMonth);
    const daysArray = [];

    for (let i = 0; i < firstDay; i++) {
      daysArray.push(<div key={`empty-${i}`} className="h-14"></div>);
    }

    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === formatDateString(new Date());
      const indicators = indicatorsMap[dateStr];

      daysArray.push(
        <button
          key={dateStr}
          onClick={() => setSelectedDate(dateStr)}
          onDoubleClick={() => onSelectDate(dateStr)}
          className={`h-14 flex flex-col items-center justify-start pt-1.5 rounded-lg transition relative ${
             isSelected ? 'bg-[#6E96B8]/10' : 'hover:bg-slate-50'
          }`}
        >
          <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1 ${
             isSelected ? 'bg-[#6E96B8] text-white shadow-md' : 
             isToday ? 'bg-slate-200 text-slate-800' : 'text-slate-700'
          }`}>
            {d}
          </span>
          <div className="flex gap-0.5 justify-center mt-0.5 h-1.5">
            {indicators?.pink && <div className="w-1.5 h-1.5 rounded-full bg-[#CA8787]"></div>}
            {indicators?.green && <div className="w-1.5 h-1.5 rounded-full bg-[#A0C3D2]"></div>}
            {indicators?.orange && <div className="w-1.5 h-1.5 rounded-full bg-[#EF9C66]"></div>}
            {indicators?.yellow && <div className="w-1.5 h-1.5 rounded-full bg-[#F2D388]"></div>}
            {indicators?.blue && <div className="w-1.5 h-1.5 rounded-full bg-[#898AA6]"></div>}
          </div>
        </button>
      );
    }
    return daysArray;
  };
  
  const hasPendingBackups = pendingBackupRecords.length > 0;

  return (
    <div className="pb-24 p-4 max-w-4xl mx-auto relative">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-slate-800">歷史紀錄</h2>
        <button 
            type="button"
            onClick={handleOpenBackup}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition text-sm font-bold shadow-sm ${
                hasPendingBackups 
                ? 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 shadow-amber-200/50 animate-pulse' 
                : 'bg-[#6E96B8] hover:bg-[#5D84A6] text-white shadow-[#6E96B8]/20'
            }`}
        >
            {hasPendingBackups && <AlertTriangle size={18} className="text-amber-600" />}
            {!hasPendingBackups && <CloudUpload size={18} />}
            雲端備份
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
         <div className="flex justify-between items-center mb-4">
            <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
               <ChevronLeft size={20} />
            </button>
            <h3 className="text-lg font-bold text-slate-700">
               {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
            </h3>
            <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
               <ChevronRight size={20} />
            </button>
         </div>

         <div className="grid grid-cols-7 mb-2">
            {WEEK_DAYS.map(day => (
               <div key={day} className="text-center text-xs text-slate-400 font-medium">
                  {day}
               </div>
            ))}
         </div>

         <div className="grid grid-cols-7">
            {renderCalendarDays()}
         </div>

         <div className="flex flex-wrap gap-3 justify-center mt-4 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1">
               <div className="w-2 h-2 rounded-full bg-[#CA8787]"></div>
               <span className="text-[10px] text-slate-500">水量</span>
            </div>
            <div className="flex items-center gap-1">
               <div className="w-2 h-2 rounded-full bg-[#A0C3D2]"></div>
               <span className="text-[10px] text-slate-500">尿塊</span>
            </div>
            <div className="flex items-center gap-1">
               <div className="w-2 h-2 rounded-full bg-[#EF9C66]"></div>
               <span className="text-[10px] text-slate-500">大便</span>
            </div>
            <div className="flex items-center gap-1">
               <div className="w-2 h-2 rounded-full bg-[#F2D388]"></div>
               <span className="text-[10px] text-slate-500">零食</span>
            </div>
            <div className="flex items-center gap-1">
               <div className="w-2 h-2 rounded-full bg-[#898AA6] ml-1"></div>
               <span className="text-[10px] text-slate-500">備註</span>
            </div>
         </div>
      </div>

      <div className="space-y-4">
        {selectedDate && (
             <div className="flex items-center gap-2 text-slate-500 px-1">
                <CalendarIcon size={16} />
                <span className="text-sm font-bold">
                    {selectedDate} 與前 6 天紀錄
                </span>
             </div>
        )}

        <div className="space-y-3">
            {displayedRecords.length > 0 ? (
                displayedRecords.map(record => {
                  const stats = calculateDailyStats(record, foods);
                  
                  let kibbleStats = { grams: 0, cals: 0 };
                  let cannedStats = { grams: 0, cals: 0 };
                  let snackStats = { grams: 0, cals: 0 };

                  if(record.foodIntakes) {
                      record.foodIntakes.forEach(intake => {
                          const f = foods.find(x => x.id === intake.foodId);
                          if(f) {
                              const cals = intake.amount * f.caloriesPerGram;
                              const typeStr = f.type as string;
                              
                              if(typeStr === '飼料') {
                                  kibbleStats.grams += intake.amount;
                                  kibbleStats.cals += cals;
                              } else if (typeStr === '罐頭') {
                                  cannedStats.grams += intake.amount;
                                  cannedStats.cals += cals;
                              } else {
                                  snackStats.grams += intake.amount;
                                  snackStats.cals += cals;
                              }
                          }
                      });
                  }

                  let bowlWater = 0;
                  let directWater = 0;
                  
                  if(record.waterIntakes) {
                      record.waterIntakes.forEach(w => {
                          if(w.type === 'bowl' && w.amount2 !== null) {
                              bowlWater += Math.max(0, w.amount1 - w.amount2 - (w.evaporation || 0));
                          } else if (w.type === 'direct') {
                              directWater += w.amount1;
                          } else if (w.type === 'evaporation') {
                              bowlWater -= w.amount1; 
                          }
                      });
                  }
                  
                  const historicalWeight = dailyWeightMap.get(record.date) || 5.0;
                  const dynamicWaterGoal = historicalWeight * 40;
                  const isLowWater = stats.totalWater < dynamicWaterGoal;

                  const urineVal = getUrineValue(record.urineSize);
                  const isSmallUrine = urineVal <= 1.5;
                  const sideRatio = stats.totalCalories > 0 ? (stats.sideCalories / stats.totalCalories) * 100 : 0;
                  const isHighSideRatio = sideRatio > 10;
                  const isAbnormalStool = record.stoolStatus !== '正常';
                  
                  const daysSinceLitter = dailyLitterAgeMap.get(record.date) ?? -1;
                  const isLitterOverdue = settings.litterInterval ? (daysSinceLitter > settings.litterInterval && daysSinceLitter !== -1) : false;

                  const daysSinceMed = dailyMedicationAgeMap.get(record.date) ?? -1;
                  const isMedicationOverdue = settings.medicationInterval ? (daysSinceMed > settings.medicationInterval && daysSinceMed !== -1) : false;

                  const hasAnyAlert = isLowWater || isSmallUrine || isHighSideRatio || isAbnormalStool || isLitterOverdue || isMedicationOverdue;
                  
                  let cardClasses = "p-4 rounded-xl shadow-sm border transition cursor-pointer flex flex-col group relative ";
                  if (hasAnyAlert) {
                      cardClasses += "bg-[#FFF7F7] border-[#EECACA]";
                  } else {
                      cardClasses += "bg-white border-slate-100 hover:border-[#6E96B8]";
                  }
                  
                  const isSelectedDay = record.date === selectedDate;
                  if (isSelectedDay) {
                      cardClasses += " ring-2 ring-[#6E96B8]/40";
                  }

                  const hasFooter = record.weight > 0 || record.notes;

                  const calorieRows = [];
                  const totalCals = stats.totalCalories || 1;

                  if (kibbleStats.grams > 0) {
                      const pct = (kibbleStats.cals / totalCals * 100).toFixed(1);
                      calorieRows.push({ label: '飼料', weight: kibbleStats.grams.toFixed(1), pct: pct, isWarn: false });
                  }
                  if (cannedStats.grams > 0) {
                      const pct = (cannedStats.cals / totalCals * 100).toFixed(1);
                      calorieRows.push({ label: '罐頭', weight: cannedStats.grams.toFixed(1), pct: pct, isWarn: false });
                  }
                  if (snackStats.grams > 0) {
                      const pct = (snackStats.cals / totalCals * 100).toFixed(1);
                      calorieRows.push({ label: '零食', weight: snackStats.grams.toFixed(1), pct: pct, isWarn: isHighSideRatio });
                  }

                  const passiveTotal = bowlWater + stats.foodWater;
                  // Ensure all numeric strings are formatted to 1 decimal place
                  const foodValStr = stats.foodWater.toFixed(1);
                  const bowlValStr = bowlWater.toFixed(1);
                  const directValStr = directWater.toFixed(1);
                  const totalValStr = passiveTotal.toFixed(1);

                  return (
                    <div 
                      key={record.id} 
                      onClick={() => onSelectDate(record.date)}
                      className={cardClasses}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700 text-lg">{record.date}</span>
                            {isSelectedDay && <span className="text-[10px] bg-[#6E96B8] text-white px-1.5 py-0.5 rounded">所選日期</span>}
                        </div>
                        <div className="text-slate-300 group-hover:text-[#6E96B8] transition text-xl">
                            ›
                        </div>
                      </div>

                      {hasAnyAlert && (
                        <div className="mb-3">
                           <div className="flex flex-wrap gap-2 mb-2 items-start">
                                {isLitterOverdue && (
                                    <div className="text-[#DA6C6C] text-[10px] flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 animate-pulse font-bold">
                                        <AlertTriangle size={12} className="shrink-0" /> 該換砂摟!
                                    </div>
                                )}
                                {isMedicationOverdue && (
                                    <div className="text-[#DA6C6C] text-[10px] flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 animate-pulse font-bold">
                                        <AlertTriangle size={12} className="shrink-0" /> 該點藥摟!
                                    </div>
                                )}
                                
                                {isLowWater && (
                                    <div className="text-xs text-[#DA6C6C] flex items-center gap-1 font-bold px-1 py-1">
                                    <AlertTriangle size={12} className="shrink-0" /> 水量偏低
                                    </div>
                                )}
                                {isSmallUrine && (
                                    <div className="text-xs text-[#DA6C6C] flex items-center gap-1 font-bold px-1 py-1">
                                    <AlertTriangle size={12} className="shrink-0" /> 尿塊偏小 ({record.urineSize})
                                    </div>
                                )}
                                {isHighSideRatio && (
                                    <div className="text-xs text-[#DA6C6C] flex items-center gap-1 font-bold px-1 py-1">
                                    <Cookie size={12} className="shrink-0" /> 零食過高 ({sideRatio.toFixed(1)}%)
                                    </div>
                                )}
                                {isAbnormalStool && (
                                    <div className="text-xs text-[#DA6C6C] flex items-center gap-1 font-bold px-1 py-1">
                                        <AlertTriangle size={12} className="shrink-0" /> 大便狀態：{record.stoolStatus}
                                    </div>
                                )}
                           </div>
                           <div className="border-t border-[#898AA6]/30"></div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 mb-3">
                         {/* LEFT: CALORIES */}
                         <div className="flex flex-col gap-2">
                             <div className="bg-[#D68C8C]/10 border border-[#D68C8C]/30 rounded-xl py-2 px-1 flex flex-col items-center justify-center">
                                 <div className="flex flex-col items-start">
                                     <div className="flex items-center gap-1.5 text-[#9E4F4F] text-[10px] font-bold whitespace-nowrap mb-0.5">
                                        <Flame size={12} /> 總熱量
                                     </div>
                                     <div className="flex items-baseline gap-1 text-[#9E4F4F]">
                                        <span className="text-xl font-bold">{stats.totalCalories.toFixed(1)}</span>
                                        <span className="text-[10px] font-medium opacity-80">cal</span>
                                     </div>
                                 </div>
                             </div>
                             
                             <div className="flex flex-col gap-0.5 px-1 mt-2">
                                {calorieRows.length > 0 ? (
                                    <>
                                        <div className="flex gap-2 h-[18px] items-center">
                                            {calorieRows.map((item, idx) => (
                                                <div key={idx} className={`flex-1 text-center text-[11px] whitespace-nowrap ${item.isWarn ? "text-[#DA6C6C] font-bold" : "text-[#A67B7B] font-bold"}`}>
                                                    {item.label}
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex gap-2 h-[18px] items-center">
                                            {calorieRows.map((item, idx) => (
                                                <div key={idx} className={`flex-1 text-center text-[10px] whitespace-nowrap ${item.isWarn ? "text-[#DA6C6C] font-bold" : "text-[#A67B7B]"}`}>
                                                    {item.weight} g
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex gap-2 border-t border-[#D68C8C]/30 pt-0.5 mt-0.5 h-[18px] items-center box-content">
                                            {calorieRows.map((item, idx) => (
                                                <div key={idx} className={`flex-1 text-center text-[10px] whitespace-nowrap leading-none ${item.isWarn ? "text-[#DA6C6C] font-bold" : "text-[#A67B7B]"}`}>
                                                    {item.pct}%
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full text-[10px] whitespace-nowrap text-[#A67B7B] opacity-50 text-center">-</div>
                                )}
                             </div>
                         </div>

                         {/* RIGHT: WATER */}
                         <div className="flex flex-col gap-2">
                             <div className="bg-[#6E96B8]/10 border border-[#6E96B8]/30 rounded-xl py-2 px-1 flex flex-col items-center justify-center">
                                 <div className="flex flex-col items-start">
                                    <div className="flex items-center gap-1.5 text-[#426A8C] text-[10px] font-bold whitespace-nowrap mb-0.5">
                                        <Droplet size={12} /> 總水量
                                    </div>
                                    <div className="flex items-baseline gap-1 text-[#426A8C]">
                                        <span className="text-xl font-bold">{stats.totalWater.toFixed(1)}</span>
                                        <span className="text-[10px] font-medium opacity-80">ml</span>
                                    </div>
                                 </div>
                             </div>

                             <div className="flex flex-col gap-0.5 px-1 mt-2">
                                 <div className="flex gap-2 h-[18px] items-center">
                                     <div className="flex-1 text-center text-[11px] whitespace-nowrap text-[#426A8C] font-bold">食物</div>
                                     <div className="flex-1 text-center text-[11px] whitespace-nowrap text-[#426A8C] font-bold">水碗</div>
                                     <div className="flex-1 text-center text-[11px] whitespace-nowrap text-[#426A8C] font-bold">直飲</div>
                                 </div>

                                 <div className="flex gap-2 h-[18px] items-center">
                                     <div className="flex-1 text-center text-[10px] whitespace-nowrap text-[#547896]">{foodValStr} ml</div>
                                     <div className="flex-1 text-center text-[10px] whitespace-nowrap text-[#547896]">{bowlValStr} ml</div>
                                     <div className="flex-1 text-center text-[10px] whitespace-nowrap text-[#547896]">{directValStr} ml</div>
                                 </div>

                                 <div className="flex gap-2 border-t border-[#6E96B8]/30 pt-0.5 mt-0.5 h-[18px] items-center box-content">
                                    <div className="flex-1 text-left text-[11px] whitespace-nowrap text-[#547896]">小計</div>
                                    <div className="flex-1 text-center text-[10px] whitespace-nowrap text-[#547896]">{totalValStr} ml</div>
                                    <div className="flex-1"></div>
                                 </div>
                             </div>
                         </div>
                      </div>
                      
                      {hasFooter && (
                        <div className="mt-2 pt-2 border-t border-[#898AA6]/30 flex flex-col gap-2">
                           {record.weight > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <Scale size={12} className="text-[#898AA6] shrink-0" />
                                    <span className="text-xs text-[#898AA6] font-medium">體重 {record.weight} kg</span>
                                </div>
                           )}
                           {record.notes && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {record.notes.split('、').map((note, i) => (
                                note.trim() && (
                                  <span key={i} className="text-[10px] bg-[#898AA6]/30 text-[#898AA6] px-2 py-0.5 rounded-full font-medium">
                                    {note.trim()}
                                  </span>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
            ) : (
                <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 text-sm">
                    此日期區間沒有紀錄。
                </div>
            )}
        </div>
      </div>

      {showBackupModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <CloudUpload size={20} className="text-[#6E96B8]"/>
                        上傳至 Google Sheets
                    </h3>
                    <button 
                        type="button"
                        onClick={() => setShowBackupModal(false)}
                        className="text-slate-400 hover:text-slate-600"
                        disabled={isUploading}
                    >
                        <X size={20} />
                    </button>
                </div>
                
                {uploadSuccess ? (
                    <div className="p-8 flex flex-col items-center justify-center text-center gap-4 animate-in fade-in">
                        <div className="w-16 h-16 rounded-full bg-[#5CA579]/10 flex items-center justify-center text-[#5CA579]">
                            <Check size={32} strokeWidth={3} />
                        </div>
                        <h4 className="text-lg font-bold text-slate-700">上傳成功！</h4>
                        <p className="text-slate-500 text-sm">資料已成功同步至雲端試算表。</p>
                    </div>
                ) : (
                    <>
                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">開始日期</label>
                                <input 
                                    type="date"
                                    value={backupStartDate}
                                    onChange={(e) => setBackupStartDate(e.target.value)}
                                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6E96B8] bg-white text-sm"
                                    disabled={isUploading}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">結束日期</label>
                                <input 
                                    type="date"
                                    value={backupEndDate}
                                    onChange={(e) => setBackupEndDate(e.target.value)}
                                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6E96B8] bg-white text-sm"
                                    disabled={isUploading}
                                />
                            </div>
                        </div>

                        {/* Status Check */}
                        <div className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-colors ${
                            pendingBackupRecords.length > 0 ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-slate-50 border-slate-100 text-slate-400'
                        }`}>
                             {pendingBackupRecords.length > 0 ? (
                                 <>
                                    <div className="flex items-center gap-2 font-bold text-lg">
                                        <AlertTriangle size={20} className="text-amber-500" />
                                        {pendingBackupRecords.length} 筆待備份
                                    </div>
                                    <div className="text-xs opacity-80 text-center px-4 flex flex-col gap-0.5">
                                        <span>偵測到新建立或修改過的資料，</span>
                                        <span>建議立即上傳以保持同步。</span>
                                    </div>
                                 </>
                             ) : (
                                 <>
                                     <div className="flex items-center gap-2 font-bold text-lg">
                                        <Check size={20} />
                                        皆已備份
                                     </div>
                                     <div className="text-xs opacity-70">
                                         選定區間內的資料與雲端同步。
                                     </div>
                                 </>
                             )}
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 flex gap-3">
                        <button 
                            type="button"
                            onClick={() => setShowBackupModal(false)}
                            className="flex-1 py-3 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition text-sm"
                            disabled={isUploading}
                        >
                            取消
                        </button>
                        <button 
                            type="button"
                            onClick={handleCloudUpload}
                            disabled={isUploading || pendingBackupRecords.length === 0}
                            className={`flex-1 py-3 font-bold rounded-lg shadow-sm transition flex justify-center items-center gap-2 text-sm ${
                                isUploading 
                                  ? 'bg-slate-300 text-white cursor-not-allowed'
                                  : pendingBackupRecords.length > 0 
                                    ? 'bg-[#6E96B8] text-white hover:bg-[#5D84A6]'
                                    : 'bg-white text-slate-300 border border-slate-200'
                            }`}
                        >
                            {isUploading ? (
                                <>
                                  <Loader2 size={16} className="animate-spin" />
                                  上傳中...
                                </>
                            ) : pendingBackupRecords.length > 0 ? (
                                <>
                                  <CloudUpload size={16} />
                                  一鍵上傳
                                </>
                            ) : (
                                '無需上傳'
                            )}
                        </button>
                    </div>
                    </>
                )}
            </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
