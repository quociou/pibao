
import React, { useState, useEffect, useMemo } from 'react';
import { FoodDef, FoodType, AppSettings, DailyRecord } from '../types';
import { Plus, Trash2, Edit2, Save, ArrowUp, ArrowDown, GripVertical, Check, X, Star, Activity, Database, Wind, Droplet, Flame, Scale, Sprout, AlertTriangle, Syringe, Bell, CalendarClock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  foods: FoodDef[];
  settings: AppSettings;
  records: DailyRecord[];
  latestWeight: number;
  onSaveFood: (food: FoodDef) => Promise<void>;
  onDeleteFood: (id: string) => Promise<void>;
  onReorderFoods?: (foods: FoodDef[]) => Promise<void>;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
}

// Removed '副食'
const FOOD_TYPES: FoodType[] = ['罐頭', '飼料', '零食'];

const ACTIVITY_FACTORS = [
  { value: 0.8, label: '過胖 (0.8)' },
  { value: 0.9, label: '稍胖 (0.9)' },
  { value: 1.0, label: '懶散 (1.0)' },
  { value: 1.1, label: '正常 (1.1)' },
  { value: 1.2, label: '活力 (1.2)' },
];

const FoodManager: React.FC<Props> = ({ foods, settings, records, latestWeight, onSaveFood, onDeleteFood, onReorderFoods, onSaveSettings }) => {
  const [activeTab, setActiveTab] = useState<'database' | 'health'>('health');
  
  // --- Food Database State ---
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [localFoods, setLocalFoods] = useState<FoodDef[]>([]);
  const [selectedDbType, setSelectedDbType] = useState<FoodType | null>(null);

  // Form State (Food)
  const [name, setName] = useState('');
  const [type, setType] = useState<FoodType>('罐頭');
  const [calories, setCalories] = useState('');
  const [water, setWater] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [defaultAmount, setDefaultAmount] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [draggedItem, setDraggedItem] = useState<FoodDef | null>(null);

  // --- Health Settings State ---
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showSettingsSuccess, setShowSettingsSuccess] = useState(false);

  // Sync props to local state
  useEffect(() => {
    setLocalFoods(foods);
  }, [foods]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // --- Calculations ---
  const weightDiff = latestWeight - localSettings.targetWeight;
  const der = Math.pow(localSettings.targetWeight, 0.75) * 70 * localSettings.activityFactor;
  const minWater = latestWeight * 40;
  const maxWater = latestWeight * 60;

  // Colors matched to "Total Calories" in HistoryView
  const statusColors = {
    textClass: 'text-[#9E4F4F]',
    bgClass: 'bg-[#D68C8C]/15 border border-[#D68C8C]/30'
  };

  // --- Helper to calc Expected Date ---
  const calculateExpectedDate = (lastDateStr: string | null, intervalDays: number | undefined) => {
    if (!lastDateStr || !intervalDays) return '--';
    const date = new Date(lastDateStr);
    date.setDate(date.getDate() + intervalDays);
    // Adjust for timezone to ensure MM-DD is correct locally
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0].substring(5); // Return MM-DD
  };

  // --- Litter Change Calculations ---
  const litterStats = useMemo(() => {
    const litterRecords = records
      .filter(r => r.notes && r.notes.includes('換砂'))
      .sort((a, b) => b.date.localeCompare(a.date)); // Descending

    const lastLitterDate = litterRecords[0]?.date || null;
    let cycles: number[] = [];
    
    // Calculate cycles
    const limit = Math.min(litterRecords.length, 7); 
    if (litterRecords.length >= 2) {
      for (let i = 0; i < limit - 1; i++) {
        const d1 = new Date(litterRecords[i].date);
        const d2 = new Date(litterRecords[i+1].date);
        const diffTime = Math.abs(d1.getTime() - d2.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        cycles.push(diffDays);
      }
    }

    const averageCycle = cycles.length > 0 
      ? (cycles.reduce((a, b) => a + b, 0) / cycles.length).toFixed(1) 
      : '--';
    
    // Calculate current days since last litter change
    let daysSinceLast = 0;
    if (lastLitterDate) {
        const today = new Date();
        const last = new Date(lastLitterDate);
        const t1 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const t2 = new Date(last.getFullYear(), last.getMonth(), last.getDate());
        const diffTime = t1.getTime() - t2.getTime();
        daysSinceLast = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    return { lastLitterDate, averageCycle, daysSinceLast };
  }, [records]);

  const isLitterOverdueToday = useMemo(() => {
      if (!localSettings.litterInterval || !litterStats.lastLitterDate) return false;
      return litterStats.daysSinceLast > localSettings.litterInterval;
  }, [localSettings.litterInterval, litterStats.lastLitterDate, litterStats.daysSinceLast]);

  const expectedLitterDate = useMemo(() => 
    calculateExpectedDate(litterStats.lastLitterDate, localSettings.litterInterval),
  [litterStats.lastLitterDate, localSettings.litterInterval]);


  // --- Medication Calculations ---
  const medicationStats = useMemo(() => {
    const medRecords = records
      .filter(r => r.notes && r.notes.includes('點藥'))
      .sort((a, b) => b.date.localeCompare(a.date));

    const lastMedDate = medRecords[0]?.date || null;
    let cycles: number[] = [];

    // Calculate cycles
    const limit = Math.min(medRecords.length, 7); 
    if (medRecords.length >= 2) {
        for (let i = 0; i < limit - 1; i++) {
            const d1 = new Date(medRecords[i].date);
            const d2 = new Date(medRecords[i+1].date);
            const diffTime = Math.abs(d1.getTime() - d2.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            cycles.push(diffDays);
        }
    }

    const averageCycle = cycles.length > 0 
        ? (cycles.reduce((a, b) => a + b, 0) / cycles.length).toFixed(1)
        : '--';

    let daysSinceLast = 0;
    if (lastMedDate) {
        const today = new Date();
        const last = new Date(lastMedDate);
        const t1 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const t2 = new Date(last.getFullYear(), last.getMonth(), last.getDate());
        const diffTime = t1.getTime() - t2.getTime();
        daysSinceLast = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    return { lastMedDate, averageCycle, daysSinceLast };
  }, [records]);

  const isMedicationOverdueToday = useMemo(() => {
      if (!localSettings.medicationInterval || !medicationStats.lastMedDate) return false;
      return medicationStats.daysSinceLast > localSettings.medicationInterval;
  }, [localSettings.medicationInterval, medicationStats.lastMedDate, medicationStats.daysSinceLast]);

  const expectedMedDate = useMemo(() => 
    calculateExpectedDate(medicationStats.lastMedDate, localSettings.medicationInterval),
  [medicationStats.lastMedDate, localSettings.medicationInterval]);

  // --- Feeder Wash Calculations ---
  const feederStats = useMemo(() => {
    const feederRecords = records
      .filter(r => r.notes && r.notes.includes('洗飼料機'))
      .sort((a, b) => b.date.localeCompare(a.date));

    const lastFeederDate = feederRecords[0]?.date || null;
    let cycles: number[] = [];

    // Calculate cycles
    const limit = Math.min(feederRecords.length, 7); 
    if (feederRecords.length >= 2) {
        for (let i = 0; i < limit - 1; i++) {
            const d1 = new Date(feederRecords[i].date);
            const d2 = new Date(feederRecords[i+1].date);
            const diffTime = Math.abs(d1.getTime() - d2.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            cycles.push(diffDays);
        }
    }

    const averageCycle = cycles.length > 0 
        ? (cycles.reduce((a, b) => a + b, 0) / cycles.length).toFixed(1)
        : '--';

    let daysSinceLast = 0;
    if (lastFeederDate) {
        const today = new Date();
        const last = new Date(lastFeederDate);
        const t1 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const t2 = new Date(last.getFullYear(), last.getMonth(), last.getDate());
        const diffTime = t1.getTime() - t2.getTime();
        daysSinceLast = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    return { lastFeederDate, averageCycle, daysSinceLast };
  }, [records]);

  const isFeederOverdueToday = useMemo(() => {
      if (!localSettings.feederInterval || !feederStats.lastFeederDate) return false;
      return feederStats.daysSinceLast > localSettings.feederInterval;
  }, [localSettings.feederInterval, feederStats.lastFeederDate, feederStats.daysSinceLast]);

  const expectedFeederDate = useMemo(() => 
    calculateExpectedDate(feederStats.lastFeederDate, localSettings.feederInterval),
  [feederStats.lastFeederDate, localSettings.feederInterval]);


  // --- Chart Data Preparation ---
  const weightData = useMemo(() => {
    const validRecords = records.filter(r => r.weight > 0);
    validRecords.sort((a, b) => b.date.localeCompare(a.date));
    const latest = validRecords.length > 0 ? validRecords[0] : null;
    const chartData = validRecords.slice(0, 7).reverse().map(r => ({
        date: r.date.substring(5), // MM-DD
        weight: r.weight,
        fullDate: r.date
    }));

    return { latest, chartData };
  }, [records]);


  // --- Food Logic ---

  const resetForm = () => {
    setName('');
    setType('罐頭');
    setCalories('');
    setWater('');
    setIsDefault(false);
    setDefaultAmount('');
    setIsAdding(false);
    setEditingId(null);
    setIsProcessing(false);
    setShowDeleteConfirm(false);
  };

  const handleEditClick = (e: React.MouseEvent, food: FoodDef) => {
    e.stopPropagation();
    e.preventDefault();
    setName(food.name);
    setType(food.type);
    setCalories(food.caloriesPerGram.toString());
    setWater(food.waterContentPercent.toString());
    setIsDefault(!!food.isDefault);
    setDefaultAmount(food.defaultAmount ? food.defaultAmount.toString() : '');
    setEditingId(food.id);
    setIsAdding(true);
    setShowDeleteConfirm(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!name || !calories || !water) return;
    setIsProcessing(true);

    const newFood: FoodDef = {
      id: editingId || uuidv4(),
      name,
      type,
      caloriesPerGram: parseFloat(calories),
      waterContentPercent: parseFloat(water),
      order: editingId ? foods.find(f => f.id === editingId)?.order : undefined,
      isDefault,
      defaultAmount: isDefault && defaultAmount ? parseFloat(defaultAmount) : undefined
    };

    try {
      await onSaveFood(newFood);
      resetForm();
    } catch (error) {
      alert("儲存失敗，請檢查網路連線");
      setIsProcessing(false);
    }
  };

  const executeDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editingId) return;
    setIsProcessing(true);
    try {
      await onDeleteFood(editingId);
      resetForm();
    } catch (error) {
      alert("刪除失敗，請檢查網路連線");
      setIsProcessing(false);
    }
  };

  const saveOrder = async (newOrderList: FoodDef[]) => {
    setLocalFoods(newOrderList);
    const updatedFoods = newOrderList.map((f, index) => ({ ...f, order: index }));
    if (onReorderFoods) {
      try { await onReorderFoods(updatedFoods); } catch (e) { console.error(e); }
    }
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    // Determine which list is being displayed (filtered or full)
    const currentList = selectedDbType 
        ? localFoods.filter(f => f.type === selectedDbType)
        : localFoods;

    if (direction === 'up' && index > 0) {
      const itemToMove = currentList[index];
      const itemAbove = currentList[index - 1];
      
      const idx1 = localFoods.findIndex(f => f.id === itemToMove.id);
      const idx2 = localFoods.findIndex(f => f.id === itemAbove.id);

      if (idx1 !== -1 && idx2 !== -1) {
          const newFoods = [...localFoods];
          [newFoods[idx1], newFoods[idx2]] = [newFoods[idx2], newFoods[idx1]];
          saveOrder(newFoods);
      }
    } else if (direction === 'down' && index < currentList.length - 1) {
      const itemToMove = currentList[index];
      const itemBelow = currentList[index + 1];

      const idx1 = localFoods.findIndex(f => f.id === itemToMove.id);
      const idx2 = localFoods.findIndex(f => f.id === itemBelow.id);

      if (idx1 !== -1 && idx2 !== -1) {
          const newFoods = [...localFoods];
          [newFoods[idx1], newFoods[idx2]] = [newFoods[idx2], newFoods[idx1]];
          saveOrder(newFoods);
      }
    }
  };

  const onDragStart = (e: React.DragEvent<HTMLDivElement>, item: FoodDef) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
    
    // Try to set the drag image to the whole row (parent)
    // The currentTarget is the handle div, so parent is the row
    if (e.currentTarget.parentElement) {
       e.dataTransfer.setDragImage(e.currentTarget.parentElement, 0, 0);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (!draggedItem) return;
    
    const currentList = selectedDbType 
        ? localFoods.filter(f => f.type === selectedDbType) 
        : localFoods;

    const targetItem = currentList[index];
    if (!targetItem || draggedItem.id === targetItem.id) return;

    const draggedIdx = localFoods.findIndex(f => f.id === draggedItem.id);
    const targetIdx = localFoods.findIndex(f => f.id === targetItem.id);

    if (draggedIdx === -1 || targetIdx === -1) return;

    const newFoods = [...localFoods];
    const [removed] = newFoods.splice(draggedIdx, 1);
    
    // We need to find the new index of the target because splice might have shifted it
    const newTargetIdx = newFoods.findIndex(f => f.id === targetItem.id);
    newFoods.splice(newTargetIdx, 0, removed);
    
    setLocalFoods(newFoods);
  };

  const onDragEnd = () => {
    setDraggedItem(null);
    saveOrder(localFoods);
  };

  const getTypeColor = (t: string) => {
    switch(t) {
        case '飼料': return 'bg-[#D68C8C]/20 text-[#A67B7B] border-[#D68C8C]/50';
        case '罐頭': return 'bg-[#6E96B8]/20 text-[#547896] border-[#6E96B8]/50';
        // Handle both legacy SideDish and Snack
        case '副食': 
        case '零食': return 'bg-[#C9BBCF]/40 text-[#6B5A72] border-[#C9BBCF]/60';
        default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // --- Settings Logic ---

  const handleSettingsChange = (key: keyof AppSettings, value: any) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    
    // Auto-save logic triggers immediately for activity factor or handled via blur for inputs
    if (key === 'activityFactor') {
        saveSettingsDirectly(updated);
    }
  };

  const saveSettingsDirectly = async (settingsToSave: AppSettings) => {
    setIsSavingSettings(true);
    try {
        await onSaveSettings(settingsToSave);
        setShowSettingsSuccess(true);
        setTimeout(() => setShowSettingsSuccess(false), 2000);
    } catch(e) {
        alert("儲存設定失敗");
    } finally {
        setIsSavingSettings(false);
    }
  };
  
  const handleBlurSave = () => {
      // Save current state on blur
      if (JSON.stringify(localSettings) !== JSON.stringify(settings)) {
         saveSettingsDirectly(localSettings);
      }
  };

  const visibleFoods = selectedDbType 
    ? localFoods.filter(f => f.type === selectedDbType)
    : [];

  return (
    <div className="p-4 max-w-4xl mx-auto pb-24">
      {/* Top Tabs (Sticky) */}
      <div className="sticky top-0 z-40 bg-[#FFFBF2] pb-4 pt-2 -mx-4 px-4">
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
                onClick={() => setActiveTab('health')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition relative ${
                    activeTab === 'health' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
            >
                <Activity size={18} />
                健康設定
                {activeTab === 'health' && showSettingsSuccess && (
                     <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#FBF3D5] font-bold bg-[#EFBC9B] px-1.5 py-1.5 rounded-full flex items-center justify-center animate-in fade-in zoom-in shadow-sm border border-[#FBF3D5]">
                        <Check size={12} strokeWidth={3} />
                     </span>
                )}
            </button>
            <button
                onClick={() => setActiveTab('database')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition ${
                    activeTab === 'database' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
            >
                <Database size={18} />
                食物資料庫
            </button>
          </div>
      </div>

      {activeTab === 'health' ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
            {/* A. Weight & Body Condition & Water Goal */}
            <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
                    <Scale className="text-[#6E96B8]" size={20} /> 體重趨勢
                </h3>
                <div className="flex gap-4 items-center mb-6">
                    {/* Left: Latest Stat */}
                    <div className="w-1/3 flex flex-col items-center justify-center py-2">
                        <div className="text-3xl font-bold text-slate-800">
                            {weightData.latest ? weightData.latest.weight : '--'}
                            <span className="text-sm font-medium opacity-60 ml-1">kg</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 bg-slate-100 px-2 py-0.5 rounded-full">
                            {weightData.latest ? weightData.latest.date : '尚無紀錄'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-2">最新測量</div>
                    </div>

                    {/* Right: Chart */}
                    <div className="w-2/3 h-32 min-w-0">
                        {weightData.chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={weightData.chartData}>
                                    <XAxis 
                                        dataKey="date" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 9, fill: '#94a3b8'}}
                                        interval={0}
                                    />
                                    <Tooltip 
                                        cursor={{fill: '#f1f5f9'}}
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                        formatter={(value: number) => [`${value} kg`, '體重']}
                                        labelStyle={{color: '#64748b', fontSize: '10px'}}
                                    />
                                    <Bar dataKey="weight" radius={[4, 4, 0, 0]}>
                                        {weightData.chartData.map((entry, index) => (
                                            <Cell 
                                                key={`cell-${index}`} 
                                                fill={entry.fullDate === weightData.latest?.date ? '#96B6C5' : '#ADC4CE'} 
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-xs text-slate-300 border border-dashed border-slate-100 rounded-lg">
                                暫無數據
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                    {/* Row 1: Target, Diff, DER */}
                    <div className="flex gap-3 mb-4">
                        {/* Target Weight */}
                        <div className="w-20 shrink-0">
                            <label className="block text-[10px] text-slate-500 mb-1 truncate">目標(kg)</label>
                            <input 
                                type="number"
                                step="0.1"
                                value={localSettings.targetWeight}
                                onChange={(e) => handleSettingsChange('targetWeight', parseFloat(e.target.value))}
                                onBlur={handleBlurSave}
                                className="w-full p-1.5 h-[42px] border border-slate-200 rounded-lg text-center font-bold text-slate-700 bg-[#FAFDFF] focus:ring-2 focus:ring-[#6E96B8] outline-none text-sm"
                            />
                        </div>

                        {/* Difference */}
                        <div className="w-20 shrink-0">
                            <label className="block text-[10px] text-slate-500 mb-1 truncate">差距</label>
                            <div className={`h-[42px] flex items-center justify-center rounded-lg text-sm font-bold border ${statusColors.textClass} ${statusColors.bgClass}`}>
                                {weightDiff > 0 ? '+' : ''}{weightDiff.toFixed(1)}
                            </div>
                        </div>

                        {/* DER (Moved to same row) */}
                        <div className="flex-1 min-w-0">
                             <label className="block text-[10px] text-slate-500 mb-1 truncate">
                                每日熱量(DER) 
                             </label>
                             <div className="h-[42px] bg-[#ADC4CE]/20 rounded-lg border border-[#ADC4CE]/50 px-2 flex items-center justify-center">
                                <div className="flex items-center gap-1 text-[#D68C8C] font-bold text-lg">
                                    <Flame size={16} />
                                    {der.toFixed(0)} <span className="text-xs font-normal text-slate-500">kcal</span>
                                </div>
                             </div>
                        </div>
                    </div>

                    {/* Row 2: Activity Factor */}
                    <div className="mb-0">
                        <label className="block text-[10px] text-slate-500 mb-2">需求因子</label>
                        <div className="grid grid-cols-5 gap-1">
                            {ACTIVITY_FACTORS.map(f => (
                                <button
                                    key={f.value}
                                    onClick={() => handleSettingsChange('activityFactor', f.value)}
                                    disabled={isSavingSettings}
                                    className={`py-2 rounded-lg border transition flex flex-col items-center justify-center gap-0.5 ${
                                        localSettings.activityFactor === f.value
                                        ? 'bg-[#6E96B8] text-white border-[#6E96B8] shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    } ${isSavingSettings ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    <span className="text-xs font-bold">{f.label.split(' ')[0]}</span>
                                    <span className="text-[10px] opacity-80">{f.value}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Footer Formula Note */}
                    <div className="text-[10px] text-slate-400 mt-2 px-1">
                       * DER 計算公式：目標體重^0.75 x 70 x 需求因子
                    </div>
                </div>

                {/* --- Moved Water Goal & Evaporation Here --- */}
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Left: Goal - UPDATED STYLE: DER colors */}
                        <div className="bg-[#ADC4CE]/20 rounded-xl border border-[#ADC4CE]/50 p-4 flex flex-col items-center justify-center gap-2 h-28">
                            <div className="flex items-center gap-1.5 text-[#547896] font-bold text-sm">
                                    <Droplet size={16} /> 目標水量
                            </div>
                            <div className="text-xl font-bold text-[#426A8C]">
                                {minWater.toFixed(0)} ~ {maxWater.toFixed(0)}
                            </div>
                        </div>
                        
                        {/* Right: Evaporation */}
                        <div className="bg-[#FAFDFF] rounded-xl border border-slate-200 p-4 flex flex-col items-center justify-center gap-2 h-28">
                            <div className="flex items-center gap-1.5 text-slate-500 font-bold text-sm">
                                <Wind size={16} /> 預設蒸發
                            </div>
                            <input 
                                type="number"
                                value={localSettings.defaultEvaporation}
                                onChange={(e) => handleSettingsChange('defaultEvaporation', parseFloat(e.target.value))}
                                onBlur={handleBlurSave}
                                className="w-full text-center bg-[#FAFDFF] text-xl font-bold text-slate-700 outline-none placeholder:text-slate-300 rounded-lg py-1"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div className="text-[10px] text-slate-400 mt-2 px-1">
                        * 目標水量公式：體重({latestWeight}kg) x 40 ~ 60
                    </div>
                </div>
            </section>

             {/* B. Reminders (Litter & Medication & Feeder) */}
             <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
                    <Bell className="text-[#6E96B8]" size={20} /> 提醒
                </h3>
                
                {/* 1. Litter Change */}
                <div className="mb-6 pb-6 border-b border-slate-100 last:border-0 last:pb-0 last:mb-0">
                    <div className="flex justify-between items-center mb-3">
                         <h4 className="text-sm font-bold text-slate-700">
                            換砂提醒
                         </h4>
                         {isLitterOverdueToday && (
                             <span className="text-[#DA6C6C] text-xs flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 animate-pulse font-bold">
                                 <AlertTriangle size={12} /> 該換砂摟!
                             </span>
                         )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {/* Top Left: Last Change */}
                        <div className="bg-[#ADC4CE]/20 rounded-xl p-2 border border-[#ADC4CE]/50 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5">上次換砂</span>
                            <span className="text-sm font-bold text-[#4B7C91]">{litterStats.lastLitterDate ? litterStats.lastLitterDate.substring(5) : '--'}</span>
                        </div>

                        {/* Top Right: Average Cycle */}
                        <div className="bg-[#ADC4CE]/20 rounded-xl p-2 border border-[#ADC4CE]/50 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5">平均週期</span>
                            <span className="text-sm font-bold text-[#4B7C91]">{litterStats.averageCycle} <span className="text-[10px] font-normal text-slate-400">天</span></span>
                        </div>

                         {/* Bottom Left: Expected Date (Styled like Last Date) */}
                         <div className="bg-[#ADC4CE]/20 rounded-xl p-2 border border-[#ADC4CE]/50 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1">
                                <CalendarClock size={12} /> 預計換砂
                            </span>
                            <span className="text-sm font-bold text-[#4B7C91]">
                                {expectedLitterDate}
                            </span>
                        </div>

                        {/* Bottom Right: Interval Input */}
                        <div className="bg-[#FAFDFF] rounded-xl border border-slate-200 p-2 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5 font-bold">預設天數</span>
                            <input 
                                type="number"
                                value={localSettings.litterInterval || ''}
                                onChange={(e) => handleSettingsChange('litterInterval', parseFloat(e.target.value))}
                                onBlur={handleBlurSave}
                                className="w-full text-center bg-[#FAFDFF] rounded-lg py-1 text-lg font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                placeholder="天數"
                            />
                        </div>
                    </div>
                </div>

                {/* 2. Feeder Washing (New) */}
                <div className="mb-6 pb-6 border-b border-slate-100 last:border-0 last:pb-0 last:mb-0">
                    <div className="flex justify-between items-center mb-3">
                         <h4 className="text-sm font-bold text-slate-700">
                            洗飼料機
                         </h4>
                         {isFeederOverdueToday && (
                             <span className="text-[#DA6C6C] text-xs flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 animate-pulse font-bold">
                                 <AlertTriangle size={12} /> 該洗飼料機摟!
                             </span>
                         )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {/* Top Left: Last Wash */}
                        <div className="bg-[#ADC4CE]/20 rounded-xl p-2 border border-[#ADC4CE]/50 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5">上次清洗</span>
                            <span className="text-sm font-bold text-[#4B7C91]">{feederStats.lastFeederDate ? feederStats.lastFeederDate.substring(5) : '--'}</span>
                        </div>

                        {/* Top Right: Average Cycle */}
                        <div className="bg-[#ADC4CE]/20 rounded-xl p-2 border border-[#ADC4CE]/50 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5">平均週期</span>
                            <span className="text-sm font-bold text-[#4B7C91]">{feederStats.averageCycle} <span className="text-[10px] font-normal text-slate-400">天</span></span>
                        </div>

                         {/* Bottom Left: Expected Date */}
                         <div className="bg-[#ADC4CE]/20 rounded-xl p-2 border border-[#ADC4CE]/50 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1">
                                <CalendarClock size={12} /> 預計清洗
                            </span>
                            <span className="text-sm font-bold text-[#4B7C91]">
                                {expectedFeederDate}
                            </span>
                        </div>

                        {/* Bottom Right: Interval Input */}
                        <div className="bg-[#FAFDFF] rounded-xl border border-slate-200 p-2 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5 font-bold">預設天數</span>
                            <input 
                                type="number"
                                value={localSettings.feederInterval || ''}
                                onChange={(e) => handleSettingsChange('feederInterval', parseFloat(e.target.value))}
                                onBlur={handleBlurSave}
                                className="w-full text-center bg-[#FAFDFF] rounded-lg py-1 text-lg font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                placeholder="天數"
                            />
                        </div>
                    </div>
                </div>

                {/* 3. Medication */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                         <h4 className="text-sm font-bold text-slate-700">
                            點藥提醒
                         </h4>
                         {isMedicationOverdueToday && (
                             <span className="text-[#DA6C6C] text-xs flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 animate-pulse font-bold">
                                 <AlertTriangle size={12} /> 該點藥摟!
                             </span>
                         )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {/* Top Left: Last Med */}
                        <div className="bg-[#ADC4CE]/20 rounded-xl p-2 border border-[#ADC4CE]/50 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5">上次點藥</span>
                            <span className="text-sm font-bold text-[#4B7C91]">{medicationStats.lastMedDate ? medicationStats.lastMedDate.substring(5) : '--'}</span>
                        </div>

                        {/* Top Right: Average Cycle */}
                        <div className="bg-[#ADC4CE]/20 rounded-xl p-2 border border-[#ADC4CE]/50 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5">平均週期</span>
                            <span className="text-sm font-bold text-[#4B7C91]">{medicationStats.averageCycle} <span className="text-[10px] font-normal text-slate-400">天</span></span>
                        </div>

                         {/* Bottom Left: Expected Date (Styled like Last Date) */}
                         <div className="bg-[#ADC4CE]/20 rounded-xl p-2 border border-[#ADC4CE]/50 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1">
                                <CalendarClock size={12} /> 預計點藥
                            </span>
                            <span className="text-sm font-bold text-[#4B7C91]">
                                {expectedMedDate}
                            </span>
                        </div>

                        {/* Bottom Right: Interval Input */}
                        <div className="bg-[#FAFDFF] rounded-xl border border-slate-200 p-2 flex flex-col items-center justify-center h-20">
                            <span className="text-[10px] text-slate-500 mb-0.5 font-bold">預設天數</span>
                            <input 
                                type="number"
                                value={localSettings.medicationInterval || ''}
                                onChange={(e) => handleSettingsChange('medicationInterval', parseFloat(e.target.value))}
                                onBlur={handleBlurSave}
                                className="w-full text-center bg-[#FAFDFF] rounded-lg py-1 text-lg font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                placeholder="天數"
                            />
                        </div>
                    </div>
                </div>

            </section>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
           {/* D. Food Database Display */}
           <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">資料庫內容</h2>
                {!isAdding && (
                    <button
                        type="button"
                        onClick={() => {
                            setIsAdding(true);
                            setEditingId(null);
                            setType(selectedDbType || '罐頭');
                        }}
                        className="flex items-center gap-1 bg-[#6E96B8] text-white px-3 py-1.5 rounded-lg shadow hover:bg-[#5D84A6] transition text-sm"
                    >
                        <Plus size={16} /> 新增項目
                    </button>
                )}
           </div>

           {/* Type Filter Buttons */}
           <div className="grid grid-cols-4 gap-2 mb-6">
                {FOOD_TYPES.map(t => {
                   let activeClass = '';
                   switch(t) {
                     case '罐頭': activeClass = 'bg-[#6E96B8] text-white ring-2 ring-[#6E96B8]/30'; break;
                     case '飼料': activeClass = 'bg-[#D68C8C] text-white ring-2 ring-[#D68C8C]/30'; break;
                     case '零食': activeClass = 'bg-[#C9BBCF] text-white ring-2 ring-[#C9BBCF]/30'; break;
                   }
                   
                   const isSelected = selectedDbType === t;

                   return (
                     <button
                       key={t}
                       onClick={() => setSelectedDbType(isSelected ? null : t)}
                       className={`py-2 rounded-lg text-xs font-bold transition shadow-sm ${
                         isSelected ? activeClass : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                       }`}
                     >
                       {t}
                     </button>
                   );
                })}
           </div>

           {/* Add/Edit Form */}
           {isAdding && (
                <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-[#6E96B8]/20 mb-8 animate-in zoom-in-95 duration-200">
                    <h3 className="text-lg font-bold mb-4 text-slate-700 border-b border-slate-100 pb-2">{editingId ? '編輯食物' : '新增食物'}</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">種類</label>
                            <div className="grid grid-cols-4 gap-2">
                                {FOOD_TYPES.map((t) => (
                                    <button
                                    key={t}
                                    type="button"
                                    onClick={() => setType(t)}
                                    className={`py-1.5 text-xs font-medium rounded border transition ${
                                        type === t
                                        ? 'bg-slate-800 text-white border-slate-800'
                                        : 'bg-slate-50 text-slate-500 border-slate-200'
                                    }`}
                                    >
                                    {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">名稱</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#6E96B8] outline-none bg-slate-50"
                                placeholder="例如：雞肉燉菜"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">熱量 (kcal/g)</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={calories}
                                    onChange={e => setCalories(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#6E96B8] outline-none bg-slate-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">含水量 (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={water}
                                    onChange={e => setWater(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#6E96B8] outline-none bg-slate-50"
                                />
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg">
                                <input 
                                type="checkbox" 
                                id="defaultCheck" 
                                checked={isDefault} 
                                onChange={(e) => setIsDefault(e.target.checked)}
                                className="w-4 h-4 text-[#6E96B8] rounded border-slate-300 bg-white"
                                />
                                <label htmlFor="defaultCheck" className="text-sm font-medium text-slate-700 cursor-pointer">
                                設為每日預設項目
                                </label>
                            </div>
                            {isDefault && (
                                <div className="mt-2 ml-6">
                                    <label className="block text-xs text-slate-500 mb-1">預設克數 (g)</label>
                                    <input
                                        type="number"
                                        value={defaultAmount}
                                        onChange={e => setDefaultAmount(e.target.value)}
                                        className="w-24 p-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-[#6E96B8] outline-none bg-slate-50"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
                         {editingId && (
                             <button onClick={executeDelete} className="text-red-500 text-sm flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded">
                                 <Trash2 size={16} /> 刪除
                             </button>
                         )}
                         <div className="flex gap-3 ml-auto">
                            <button onClick={resetForm} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg transition text-sm">取消</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-[#6E96B8] text-white rounded-lg hover:bg-[#5D84A6] transition shadow text-sm font-bold flex items-center gap-2">
                                <Save size={16} /> 儲存
                            </button>
                         </div>
                    </div>
                </div>
           )}

           {/* List Display */}
           {!selectedDbType ? (
               <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                   <Database size={32} className="mx-auto mb-2 opacity-50" />
                   <p>請點擊上方按鈕選擇類別以檢視內容</p>
               </div>
           ) : visibleFoods.length === 0 ? (
               <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                   此類別尚未建立資料
               </div>
           ) : (
                <div className="space-y-3">
                    {visibleFoods.map((food, index) => (
                        <div 
                        key={food.id}
                        data-row-id={food.id}
                        onDragOver={(e) => onDragOver(e, index)}
                        className={`bg-white p-3 rounded-xl border shadow-sm flex items-center gap-3 group transition-all ${
                            draggedItem?.id === food.id ? 'opacity-50 scale-95 border-dashed border-[#6E96B8]' : 'border-slate-200 hover:border-[#6E96B8]/50'
                        }`}
                        >
                        <div 
                           className="cursor-grab text-slate-300 hover:text-slate-500 p-1 touch-none"
                           draggable={true}
                           onDragStart={(e) => onDragStart(e, food)}
                           onDragEnd={onDragEnd}
                        >
                            <GripVertical size={20} />
                        </div>

                        {/* Order Controls for Mobile */}
                        <div className="flex flex-col gap-1 md:hidden">
                            <button 
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    moveItem(index, 'up');
                                }}
                                disabled={index === 0}
                                className="p-2 -m-1 text-slate-400 hover:text-[#6E96B8] disabled:opacity-20 active:scale-90 transition-transform"
                            >
                                <ArrowUp size={16} />
                            </button>
                            <button 
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    moveItem(index, 'down');
                                }}
                                disabled={index === visibleFoods.length - 1}
                                className="p-2 -m-1 text-slate-400 hover:text-[#6E96B8] disabled:opacity-20 active:scale-90 transition-transform"
                            >
                                <ArrowDown size={16} />
                            </button>
                        </div>

                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded border ${getTypeColor(food.type)}`}>
                                {food.type}
                                </span>
                                <span className="font-bold text-slate-800">{food.name}</span>
                                {food.isDefault && (
                                <Star size={12} className="fill-yellow-400 text-yellow-400 ml-1" />
                                )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                                {food.caloriesPerGram} kcal/g • 含水 {food.waterContentPercent}%
                            </div>
                        </div>

                        <div className="flex gap-2 pl-2 border-l border-slate-100">
                            <button 
                            type="button"
                            onClick={(e) => handleEditClick(e, food)} 
                            disabled={isProcessing} 
                            className="p-2 text-slate-400 hover:text-[#6E96B8] hover:bg-slate-50 rounded-lg transition"
                            >
                            <Edit2 size={18} />
                            </button>
                        </div>
                        </div>
                    ))}
                </div>
           )}
        </div>
      )}
    </div>
  );
};

export default FoodManager;
