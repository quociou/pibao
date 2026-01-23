
import React, { useState, useEffect } from 'react';
import { fetchFoods, fetchRecords, saveRecordToRemote, saveFoodToRemote, deleteFoodFromRemote, saveFoodsOrderToRemote, deleteRecordFromRemote, fetchSettings, saveSettings } from './services/storage';
import { FoodDef, DailyRecord, AppSettings } from './types';
import DailyEntry from './components/DailyEntry';
import FoodManager from './components/FoodManager';
import HistoryView from './components/HistoryView';
import { ClipboardList, PieChart, Settings, Loader2 } from 'lucide-react';

// Get today's date in YYYY-MM-DD local time
const getTodayString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - (offset*60*1000));
  return localDate.toISOString().split('T')[0];
};

type View = 'record' | 'history' | 'foods';

const App: React.FC = () => {
  const [foods, setFoods] = useState<FoodDef[]>([]);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ targetWeight: 5, activityFactor: 1.0, defaultEvaporation: 0 });
  
  // Change default view to 'history'
  const [currentView, setCurrentView] = useState<View>('history');
  const [isLoading, setIsLoading] = useState(true);
  
  // Date selection state
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  
  // State to track if editing is forced (e.g. entered from History)
  const [forceEditMode, setForceEditMode] = useState(false);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [loadedFoods, loadedRecords, loadedSettings] = await Promise.all([
          fetchFoods(),
          fetchRecords(),
          fetchSettings()
        ]);
        setFoods(loadedFoods);
        setRecords(loadedRecords);
        setSettings(loadedSettings);
      } catch (error) {
        console.error("Failed to load data", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // --- Helpers ---

  // Calculate Latest Weight based on records
  const latestWeight = React.useMemo(() => {
    // Sort records desc by date
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const recordWithWeight = sorted.find(r => r.weight > 0);
    return recordWithWeight ? recordWithWeight.weight : settings.targetWeight; // Fallback to target if no records
  }, [records, settings.targetWeight]);

  // --- Actions ---

  const refreshRecords = async () => {
    try {
      const loadedRecords = await fetchRecords();
      setRecords(loadedRecords);
    } catch (error) {
      console.error("Failed to refresh records", error);
    }
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
      await saveSettings(newSettings);
      setSettings(newSettings);
  };

  const handleSaveFood = async (newFood: FoodDef) => {
    // Check if we need to unset an existing default
    let updatedPreviousDefault: FoodDef | null = null;
    if (newFood.isDefault) {
      const existingDefault = foods.find(f => f.isDefault && f.id !== newFood.id);
      if (existingDefault) {
        updatedPreviousDefault = { ...existingDefault, isDefault: false };
        await saveFoodToRemote(updatedPreviousDefault);
      }
    }

    // Save the new food
    await saveFoodToRemote(newFood, foods);
    
    // Update State
    setFoods(prev => {
      let nextFoods = [...prev];
      
      // 1. Update the previous default locally if it existed
      if (updatedPreviousDefault) {
        nextFoods = nextFoods.map(f => f.id === updatedPreviousDefault!.id ? updatedPreviousDefault! : f);
      }

      // 2. Add or Update the new food
      const exists = nextFoods.some(f => f.id === newFood.id);
      if (exists) {
        nextFoods = nextFoods.map(f => f.id === newFood.id ? newFood : f);
      } else {
        // Find current min order to prepend the new item
        const minOrder = nextFoods.reduce((min, f) => Math.min(min, f.order ?? 0), 0);
        const foodWithOrder = { ...newFood, order: newFood.order ?? (minOrder - 1) };
        nextFoods.push(foodWithOrder);
      }
      
      return nextFoods.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
  };

  const handleDeleteFood = async (id: string) => {
    await deleteFoodFromRemote(id);
    setFoods(prev => prev.filter(f => f.id !== id));
  };
  
  const handleReorderFoods = async (reorderedFoods: FoodDef[]) => {
    // Optimistic Update
    setFoods(reorderedFoods);
    // Sync to DB
    await saveFoodsOrderToRemote(reorderedFoods);
  };

  const handleSaveRecord = async (updatedRecord: DailyRecord) => {
    // Optimistic UI update could be done here, but waiting is safer for sync
    await saveRecordToRemote(updatedRecord);
    
    setRecords(prev => {
      const existingIndex = prev.findIndex(r => r.date === updatedRecord.date);
      if (existingIndex >= 0) {
        const newRecords = [...prev];
        newRecords[existingIndex] = updatedRecord;
        return newRecords;
      } else {
        return [...prev, updatedRecord];
      }
    });
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      await deleteRecordFromRemote(id);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error("Failed to delete record", error);
      alert("刪除紀錄失敗，請檢查網路連線");
    }
  };

  const getRecordForDate = (date: string) => {
    return records.find(r => r.date === date);
  };

  const navigateToDateFromHistory = (date: string) => {
    setSelectedDate(date);
    // When coming from History, we allow editing regardless of date
    setForceEditMode(true);
    setCurrentView('record');
    window.scrollTo(0,0);
  };

  const changeDateInDiary = (newDate: string) => {
    setSelectedDate(newDate);
    // When changing date inside Diary, we reset force mode.
    // Logic will fallback to "is it today?"
    setForceEditMode(false);
  };

  // --- Diary Button Click Logic ---
  const handleDiaryClick = () => {
    // Single Click: Return to the last viewed date record page immediately
    setCurrentView('record');
    window.scrollTo(0, 0);
  };

  const handleDiaryDoubleClick = () => {
    // Double Click: Go to Today (Create mode if not exists, Edit if exists)
    const today = getTodayString();
    setSelectedDate(today);
    setForceEditMode(true);
    setCurrentView('record');
    window.scrollTo(0, 0);
  };

  // Determine Read-Only Status
  const isToday = selectedDate === getTodayString();
  // Read Only if: NOT today AND NOT forced edit mode (from history)
  const isReadOnly = !isToday && !forceEditMode;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF2] flex flex-col items-center justify-center text-slate-500 gap-3">
        <Loader2 size={48} className="animate-spin text-[#6E96B8]" />
        <p>正在連線資料庫...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF2] font-sans text-slate-900">
      
      {/* Dynamic Content */}
      <main className="w-full">
        {currentView === 'record' && (
          <div>
            {/* Read Only Banner */}
            {isReadOnly && (
               <div className="bg-slate-100 text-slate-500 text-xs text-center py-1 border-b border-slate-200">
                  僅供瀏覽(由歷史紀錄可進入編輯模式)
               </div>
            )}

            <DailyEntry 
              foods={foods} 
              date={selectedDate}
              existingRecord={getRecordForDate(selectedDate)}
              settings={settings}
              onSave={handleSaveRecord}
              onSaveSettings={handleSaveSettings}
              onDelete={handleDeleteRecord}
              onDateChange={changeDateInDiary}
              readOnly={isReadOnly}
              defaultEvaporation={settings.defaultEvaporation}
            />
          </div>
        )}

        {currentView === 'history' && (
          <HistoryView 
            records={records} 
            foods={foods} 
            settings={settings}
            onSelectDate={navigateToDateFromHistory}
            onRefresh={refreshRecords}
          />
        )}

        {currentView === 'foods' && (
          <FoodManager 
            foods={foods} 
            settings={settings}
            records={records}
            latestWeight={latestWeight}
            onSaveFood={handleSaveFood}
            onDeleteFood={handleDeleteFood}
            onReorderFoods={handleReorderFoods}
            onSaveSettings={handleSaveSettings}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
        <div className="flex justify-around items-center h-16 max-w-2xl mx-auto">
          <button 
            onClick={handleDiaryClick}
            onDoubleClick={handleDiaryDoubleClick}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'record' ? 'text-[#6E96B8]' : 'text-slate-400 hover:text-[#6E96B8]'}`}
          >
            <ClipboardList size={24} />
            <span className="text-[10px] font-medium">日記</span>
          </button>
          
          <button 
            onClick={() => setCurrentView('history')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'history' ? 'text-[#6E96B8]' : 'text-slate-400 hover:text-[#6E96B8]'}`}
          >
            <PieChart size={24} />
            <span className="text-[10px] font-medium">歷史</span>
          </button>

          <button 
            onClick={() => setCurrentView('foods')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'foods' ? 'text-[#6E96B8]' : 'text-slate-400 hover:text-[#6E96B8]'}`}
          >
            <Settings size={24} />
            <span className="text-[10px] font-medium">設定</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
