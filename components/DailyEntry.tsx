import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DailyRecord, FoodDef, FoodIntake, UrineSize, StoolStatus, WaterIntake, WaterIntakeType, FoodType, AppSettings } from '../types';
import { calculateDailyStats } from '../services/storage';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash, Droplet, Flame, Utensils, Scale, Activity, GlassWater, Syringe, Edit2, Check, X, AlertTriangle, Cookie, Soup, Wind, ChevronDown, Calendar, Star, Save, Lock, ArrowUp, Search, Settings as SettingsIcon, ArrowDown, Trash2 } from 'lucide-react';

interface Props {
  foods: FoodDef[];
  date: string;
  existingRecord?: DailyRecord;
  settings: AppSettings;
  onSave: (record: DailyRecord) => void;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onDelete?: (id: string) => Promise<void> | void;
  onDateChange?: (date: string) => void;
  readOnly?: boolean;
  defaultEvaporation: number;
}

const URINE_ANCHORS = ['1元', '50元', '半拳', '一拳', '巨大'];
const STOOL_STATUSES: StoolStatus[] = ['正常', '未大便', '顆粒狀', '稀便'];
// Removed '副食'
const FOOD_TYPES: FoodType[] = ['罐頭', '飼料', '零食'];

const DailyEntry: React.FC<Props> = ({ foods, date, existingRecord, settings, onSave, onSaveSettings, onDelete, onDateChange, readOnly = false, defaultEvaporation }) => {
  // Form States
  const [weight, setWeight] = useState<string>('');
  const [foodIntakes, setFoodIntakes] = useState<FoodIntake[]>([]);
  const [waterIntakes, setWaterIntakes] = useState<WaterIntake[]>([]);
  const [urineSize, setUrineSize] = useState<UrineSize>('半拳');
  const [stoolStatus, setStoolStatus] = useState<StoolStatus>('正常');
  const [notes, setNotes] = useState('');

  // Editing States
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editingWaterId, setEditingWaterId] = useState<string | null>(null);

  // Dirty State Tracking
  const [cleanStateJson, setCleanStateJson] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);

  // Temp state for adding/editing food
  const [selectedFoodId, setSelectedFoodId] = useState<string>('');
  const [foodAmount, setFoodAmount] = useState<string>('');
  const [isFoodDropdownOpen, setIsFoodDropdownOpen] = useState(false);
  const [selectedFoodType, setSelectedFoodType] = useState<FoodType | null>(null);

  // Temp state for adding/editing water
  const [addWaterType, setAddWaterType] = useState<WaterIntakeType>('bowl');
  const [addWaterVal1, setAddWaterVal1] = useState<string>(''); // Original (bowl) or Amount (direct/evap)
  const [addWaterVal2, setAddWaterVal2] = useState<string>(''); // Leftover (bowl only)

  // Notes States
  const [isNoteEditModalOpen, setIsNoteEditModalOpen] = useState(false);
  const [presetInput, setPresetInput] = useState('');

  // Feedback State
  const [showSaveFeedback, setShowSaveFeedback] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // The 'foods' prop is already sorted
  const sortedFoods = foods;

  // Filtered food list based on selectedType
  const availableFoods = useMemo(() => {
    if (!selectedFoodType) return [];
    return sortedFoods.filter(f => f.type === selectedFoodType);
  }, [sortedFoods, selectedFoodType]);

  // Derived selected food object for display
  const selectedFood = useMemo(() => 
    foods.find(f => f.id === selectedFoodId), 
  [foods, selectedFoodId]);

  // Effect to load data when record or date changes
  useEffect(() => {
    let newWeight = '';
    let newFoodIntakes: FoodIntake[] = [];
    let newWaterIntakes: WaterIntake[] = [];
    let newUrine: UrineSize = '半拳';
    let newStool: StoolStatus = '正常';
    let newNotes = '';

    if (existingRecord) {
      newWeight = existingRecord.weight > 0 ? existingRecord.weight.toString() : '';
      newFoodIntakes = existingRecord.foodIntakes || [];
      newWaterIntakes = existingRecord.waterIntakes || [];
      newUrine = existingRecord.urineSize;
      newStool = existingRecord.stoolStatus as StoolStatus; 
      newNotes = existingRecord.notes;
    } else {
      const defaultFood = foods.find(f => f.isDefault);
      if (defaultFood) {
        newFoodIntakes = [{
          id: uuidv4(),
          foodId: defaultFood.id,
          amount: defaultFood.defaultAmount || 0
        }];
      }
    }
    
    // Ensure default evaporation entry exists if missing (legacy support)
    const hasEvaporation = newWaterIntakes.some(i => i.type === 'evaporation');
    if (!hasEvaporation) {
      const evapAmount = existingRecord ? 0 : defaultEvaporation;
      newWaterIntakes = [...newWaterIntakes, {
        id: uuidv4(),
        type: 'evaporation',
        amount1: evapAmount, 
        amount2: 0
      }];
    }

    setWeight(newWeight);
    setFoodIntakes(newFoodIntakes);
    setWaterIntakes(newWaterIntakes);
    setUrineSize(newUrine);
    setStoolStatus(newStool);
    setNotes(newNotes);

    const snapshot = {
      weight: newWeight,
      foodIntakes: newFoodIntakes,
      waterIntakes: newWaterIntakes,
      urineSize: newUrine,
      stoolStatus: newStool,
      notes: newNotes
    };
    setCleanStateJson(JSON.stringify(snapshot));
    setIsInitialized(true);

    setShowDeleteConfirm(false);
    setEditingFoodId(null);
    setEditingWaterId(null);
    setSelectedFoodType(null);
    
  }, [existingRecord, date]);

  const isDirty = useMemo(() => {
    const current = {
      weight,
      foodIntakes,
      waterIntakes,
      urineSize,
      stoolStatus,
      notes
    };
    return JSON.stringify(current) !== cleanStateJson;
  }, [weight, foodIntakes, waterIntakes, urineSize, stoolStatus, notes, cleanStateJson]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !readOnly) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, readOnly]);

  useEffect(() => {
    setShowSaveFeedback(false);
  }, [date]);

  const roundToOne = (num: number) => Math.round((num + Number.EPSILON) * 10) / 10;

  const stats = useMemo(() => {
    const tempRecord: DailyRecord = {
      id: 'temp',
      date,
      weight: parseFloat(weight) || 0,
      foodIntakes,
      waterIntakes,
      urineSize,
      urineCount: 1,
      stoolStatus,
      notes
    };
    return calculateDailyStats(tempRecord, foods);
  }, [weight, foodIntakes, waterIntakes, urineSize, stoolStatus, notes, foods, date]);

  const calorieAnalysis = useMemo(() => {
    let totalCals = 0;
    let sideCals = 0;

    foodIntakes.forEach(item => {
      const food = foods.find(f => f.id === item.foodId);
      if (food) {
        const rawCals = item.amount * food.caloriesPerGram;
        const itemCals = roundToOne(rawCals);
        totalCals += itemCals;
        // Treat legacy '副食' as snack here
        // Type cast to string for safety if types match
        const typeStr = food.type as string;
        if (typeStr === '零食' || typeStr === '副食') {
          sideCals += itemCals;
        }
      }
    });

    const ratio = totalCals > 0 ? (sideCals / totalCals) * 100 : 0;
    return { totalCals, sideCals, ratio, isHighRatio: ratio > 10 };
  }, [foodIntakes, foods]);

  const bowlGroupIntakes = useMemo(() => {
    const relevant = waterIntakes.filter(i => i.type === 'bowl' || i.type === 'evaporation');
    const bowls = relevant.filter(i => i.type === 'bowl');
    const evaps = relevant.filter(i => i.type === 'evaporation');
    return [...bowls.reverse(), ...evaps];
  }, [waterIntakes]);

  const directGroupIntakes = useMemo(() => {
    return waterIntakes.filter(i => i.type === 'direct').reverse();
  }, [waterIntakes]);

  const bowlGroupTotal = useMemo(() => {
    let total = 0;
    bowlGroupIntakes.forEach(i => {
      if (i.type === 'bowl' && i.amount2 !== null) {
        const evap = i.evaporation || 0;
        total += Math.max(0, i.amount1 - i.amount2 - evap);
      } else if (i.type === 'evaporation') {
        total -= i.amount1;
      }
    });
    return roundToOne(total);
  }, [bowlGroupIntakes]);

  const directGroupTotal = useMemo(() => {
    let total = 0;
    directGroupIntakes.forEach(i => {
      total += i.amount1;
    });
    return roundToOne(total);
  }, [directGroupIntakes]);

  const sortFoodIntakes = (intakes: FoodIntake[]) => {
    return [...intakes].sort((a, b) => {
      const indexA = foodIntakes.indexOf(a);
      const indexB = foodIntakes.indexOf(b);
      return indexB - indexA;
    });
  };

  const mainFoodIntakes = sortFoodIntakes(foodIntakes.filter(item => {
    const food = foods.find(f => f.id === item.foodId);
    return food && (food.type === '罐頭' || food.type === '飼料');
  }));

  const sideFoodIntakes = sortFoodIntakes(foodIntakes.filter(item => {
    const food = foods.find(f => f.id === item.foodId);
    // Legacy support: include '副食' here if any exist
    return food && (food.type !== '罐頭' && food.type !== '飼料');
  }));

  const getUrineSliderValue = (label: string): number => {
    const exactIndex = URINE_ANCHORS.indexOf(label);
    if (exactIndex !== -1) return exactIndex;
    if (label.includes(' ~ ')) {
      const parts = label.split(' ~ ');
      const startIdx = URINE_ANCHORS.indexOf(parts[0]);
      if (startIdx !== -1) return startIdx + 0.5;
    }
    return 2; 
  };

  const getUrineLabelFromValue = (val: number): string => {
    if (Number.isInteger(val)) {
      return URINE_ANCHORS[val] || '';
    } else {
      const floor = Math.floor(val);
      const ceil = Math.ceil(val);
      return `${URINE_ANCHORS[floor]} ~ ${URINE_ANCHORS[ceil]}`;
    }
  };

  const currentSliderValue = getUrineSliderValue(urineSize);

  // --- Note Logic ---
  const currentNotes = useMemo(() => {
      return notes ? notes.split('、').filter(n => n.trim() !== '') : [];
  }, [notes]);

  const presets = useMemo(() => {
      return settings.notePresets || [];
  }, [settings.notePresets]);

  const toggleNote = (note: string) => {
      if (readOnly) return;
      let updatedNotes = [...currentNotes];
      if (updatedNotes.includes(note)) {
          updatedNotes = updatedNotes.filter(n => n !== note);
      } else {
          updatedNotes.push(note);
      }
      setNotes(updatedNotes.join('、'));
  };
  
  // --- Note Preset Management ---
  const updatePresets = async (newPresets: string[]) => {
      // Optimistic update
      await onSaveSettings({ ...settings, notePresets: newPresets });
  };

  const addPreset = async () => {
      if (!presetInput.trim()) return;
      if (presets.includes(presetInput.trim())) return;
      await updatePresets([...presets, presetInput.trim()]);
      setPresetInput('');
  };

  const removePreset = async (preset: string) => {
      await updatePresets(presets.filter(p => p !== preset));
  };

  const movePreset = async (index: number, direction: 'up' | 'down') => {
      const newPresets = [...presets];
      if (direction === 'up' && index > 0) {
          [newPresets[index], newPresets[index - 1]] = [newPresets[index - 1], newPresets[index]];
      } else if (direction === 'down' && index < newPresets.length - 1) {
          [newPresets[index], newPresets[index + 1]] = [newPresets[index + 1], newPresets[index]];
      }
      await updatePresets(newPresets);
  };


  // --- Handlers ---

  const handleAddOrUpdateFood = () => {
    if (readOnly) return;
    if (!selectedFoodId || !foodAmount) return;
    const amount = parseFloat(foodAmount);
    if (isNaN(amount) || amount <= 0) return;

    if (editingFoodId) {
      setFoodIntakes(prev => prev.map(item => 
        item.id === editingFoodId 
          ? { ...item, foodId: selectedFoodId, amount } 
          : item
      ));
      setEditingFoodId(null);
    } else {
      setFoodIntakes([...foodIntakes, {
        id: uuidv4(),
        foodId: selectedFoodId,
        amount
      }]);
    }
    setFoodAmount('');
  };

  const handleEditFood = (intake: FoodIntake) => {
    if (readOnly) return;
    setEditingFoodId(intake.id);
    setSelectedFoodId(intake.foodId);
    
    // Auto switch type tab based on edited food
    const food = foods.find(f => f.id === intake.foodId);
    if (food) setSelectedFoodType(food.type);

    setFoodAmount(intake.amount.toString());
  };

  const cancelEditFood = () => {
    setEditingFoodId(null);
    setFoodAmount('');
    setSelectedFoodType(null);
  };

  const removeFood = (id: string) => {
    if (readOnly) return;
    setFoodIntakes(foodIntakes.filter(i => i.id !== id));
    if (editingFoodId === id) cancelEditFood();
  };

  const handleAddOrUpdateWater = () => {
    if (readOnly) return;
    const val1 = parseFloat(addWaterVal1);
    if (isNaN(val1) || val1 < 0) return;

    let val2: number | null = 0;
    
    if (addWaterType === 'bowl') {
       if (addWaterVal2.trim() === '') {
         val2 = null;
       } else {
         val2 = parseFloat(addWaterVal2);
         if (isNaN(val2) || val2 < 0) return;
       }
    } else {
      val2 = 0;
    }

    const evaporationVal = editingWaterId 
        ? (waterIntakes.find(i => i.id === editingWaterId)?.evaporation || 0) 
        : 0;

    const newItemData = {
      type: addWaterType,
      amount1: val1,
      amount2: val2,
      evaporation: evaporationVal
    };

    if (editingWaterId) {
      setWaterIntakes(prev => prev.map(item => 
        item.id === editingWaterId 
          ? { ...item, ...newItemData } 
          : item
      ));
      setEditingWaterId(null);
    } else {
      setWaterIntakes([...waterIntakes, {
        id: uuidv4(),
        ...newItemData
      }]);
    }
    
    setAddWaterVal1('');
    setAddWaterVal2('');
  };

  const handleEditWater = (intake: WaterIntake) => {
    if (readOnly) return;
    setEditingWaterId(intake.id);
    setAddWaterType(intake.type);
    setAddWaterVal1(intake.amount1.toString());
    setAddWaterVal2(intake.amount2 !== null ? intake.amount2.toString() : '');
  };

  const cancelEditWater = () => {
    setEditingWaterId(null);
    setAddWaterVal1('');
    setAddWaterVal2('');
    setAddWaterType('bowl');
  };

  const removeWater = (id: string) => {
    if (readOnly) return;
    setWaterIntakes(waterIntakes.filter(i => i.id !== id));
    if (editingWaterId === id) cancelEditWater();
  };

  const handleSave = () => {
    if (readOnly) return;
    const record: DailyRecord = {
      id: existingRecord?.id || uuidv4(),
      date,
      weight: parseFloat(weight) || 0,
      foodIntakes,
      waterIntakes,
      urineSize,
      urineCount: 1,
      stoolStatus,
      notes
    };
    onSave(record);
    
    const snapshot = {
      weight,
      foodIntakes,
      waterIntakes,
      urineSize,
      stoolStatus,
      notes
    };
    setCleanStateJson(JSON.stringify(snapshot));

    setShowSaveFeedback(true);
    setTimeout(() => {
        setShowSaveFeedback(false);
    }, 2000); 
  };
  
  const handleDelete = async () => {
    if (readOnly) return;
    if (existingRecord && onDelete) {
        await onDelete(existingRecord.id);
        setShowDeleteConfirm(false);
    }
  };

  const renderWaterRow = (item: WaterIntake) => {
    const isEditing = item.id === editingWaterId;
    let netAmount: number | string = 0;
    let description = "";
    let icon = <GlassWater size={16} />;
    let badgeColor = "bg-[#6E96B8]/10 text-[#6E96B8]";

    if (item.type === 'bowl') {
      const evap = item.evaporation || 0;
      if (item.amount2 === null) {
          description = `原始 ${item.amount1} ml (待填寫剩餘)`;
          if (evap > 0) description += ` (預扣蒸發 ${evap})`;
          netAmount = "未結算";
          badgeColor = "bg-slate-100 text-slate-500";
      } else {
          const diff = Math.max(0, item.amount1 - item.amount2 - evap);
          const displayDiff = diff.toFixed(1);
          description = `${item.amount1} - ${item.amount2}`;
          if (evap > 0) description += ` - ${evap}(蒸發)`;
          description += ` = ${displayDiff} ml`;
          netAmount = diff;
      }
    } else if (item.type === 'evaporation') {
        icon = <Wind size={16} />;
        badgeColor = "bg-slate-100 text-slate-600";
        description = `扣除 ${item.amount1} ml`;
        netAmount = -item.amount1;
    } else {
        icon = <Syringe size={16} />;
        description = `${item.amount1} ml`;
        netAmount = item.amount1;
    }
    
    return (
      <div key={item.id} className={`flex justify-between items-center p-3 rounded-lg border transition ${isEditing ? 'bg-[#6E96B8]/5 border-[#6E96B8]/30' : 'bg-white border-slate-100'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${badgeColor}`}>
            {icon}
          </div>
          <div>
            <div className="font-medium text-slate-700 text-sm flex items-center gap-2">
              {item.type === 'bowl' ? '水碗紀錄' : item.type === 'evaporation' ? '蒸發量' : '直接飲用'}
              {item.type === 'bowl' && item.amount2 === null && (
                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">未結算</span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {description}
            </div>
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-1">
            <button onClick={() => handleEditWater(item)} className="text-slate-400 hover:text-[#6E96B8] p-1.5 rounded hover:bg-slate-100 transition" disabled={!!editingWaterId}>
              <Edit2 size={16} />
            </button>
            <button onClick={() => removeWater(item.id)} className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition">
              <Trash size={16} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderIntakeRow = (item: FoodIntake) => {
    const food = foods.find(f => f.id === item.foodId);
    const isEditing = item.id === editingFoodId;
    const rawKcal = (food?.caloriesPerGram || 0) * item.amount;
    const kcal = roundToOne(rawKcal).toFixed(1);
    const waterFromFood = ((food?.waterContentPercent || 0) / 100 * item.amount).toFixed(1);
    const isFirstItem = foodIntakes.length > 0 && foodIntakes[0].id === item.id;
    const showDefaultBadge = food?.isDefault && isFirstItem;

    return (
      <div key={item.id} className={`flex justify-between items-center p-3 rounded-lg border transition ${isEditing ? 'bg-[#D68C8C]/20 border-[#D68C8C]' : 'bg-white border-[#D68C8C]/50'}`}>
        <div>
          <div className="font-medium text-slate-700 flex items-center gap-2">
            {food?.name || '未知食物'}
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                food?.type === '飼料' ? 'bg-[#D68C8C]/20 text-[#A67B7B] border border-[#D68C8C]/50' :
                food?.type === '罐頭' ? 'bg-[#6E96B8]/20 text-[#547896] border border-[#6E96B8]/50' :
                'bg-[#C9BBCF]/40 text-[#6B5A72] border border-[#C9BBCF]/60'
            }`}>
                {food?.type}
            </span>
            {showDefaultBadge && (
              <span className="flex items-center gap-1 text-[10px] bg-yellow-50 text-yellow-600 border border-yellow-200 px-1.5 py-0.5 rounded">
                <Star size={10} className="fill-yellow-600" />
                預設
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {item.amount}g • {kcal} kcal • <span className="text-[#6E96B8]">含水量 {waterFromFood} ml</span>
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-1">
            <button onClick={() => handleEditFood(item)} className="text-slate-400 hover:text-[#6E96B8] p-1.5 rounded hover:bg-slate-100 transition" disabled={!!editingFoodId}>
              <Edit2 size={16} />
            </button>
            <button onClick={() => removeFood(item.id)} className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition">
              <Trash size={16} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pb-24 max-w-2xl mx-auto">
      {/* 1. Header */}
      <div className="bg-[#6E96B8] pt-6 px-6 pb-2 text-white">
        <div className="flex justify-between items-end mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold select-none whitespace-nowrap">
              {date} 紀錄
            </h2>
          </div>
          <div className="text-white/80 text-sm flex items-center gap-1">
             {readOnly && <Lock size={12} className="opacity-70" />}
             皮寶健康日記
          </div>
        </div>
      </div>
      
      {/* 2. Sticky Stats & Save */}
      <div className="sticky top-0 z-30 bg-[#6E96B8] px-4 pb-3 pt-2 rounded-b-3xl shadow-lg mb-6 text-white transition-all duration-300">
        <div className="grid grid-cols-2 gap-3 mb-2">
          {/* Calorie Box */}
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl h-[72px] flex flex-col items-center justify-center">
             <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold whitespace-nowrap mb-0.5">
                   <Flame size={12} /> 總熱量
                </div>
                <div className="flex items-baseline gap-1 ml-[18px]">
                   <span className="text-xl font-bold">{stats.totalCalories.toFixed(1)}</span>
                   <span className="text-xs text-white/80">cal</span>
                </div>
             </div>
          </div>

          {/* Water Box */}
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl h-[72px] flex flex-col items-center justify-center">
             <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold whitespace-nowrap mb-0.5">
                  <Droplet size={12} /> 總水量
                </div>
                <div className="flex items-baseline gap-1 ml-[18px]">
                   <span className="text-xl font-bold">{stats.totalWater.toFixed(1)}</span>
                   <span className="text-xs text-white/80">ml</span>
                </div>
             </div>
          </div>
        </div>

        {/* Dynamic Action Button (Scroll Top or Save) */}
        <div className="flex justify-end mt-1">
            {(!readOnly && isInitialized && (isDirty || showSaveFeedback)) ? (
                <button
                onClick={handleSave}
                disabled={showSaveFeedback}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all animate-in fade-in zoom-in duration-200 ${
                    showSaveFeedback 
                        ? 'bg-[#EFBC9B] text-[#FBF3D5]' 
                        : 'bg-[#F7E396] text-[#E97F4A] border border-[#F7E396] hover:bg-[#F0D875]'
                }`}
                >
                {showSaveFeedback ? ( <> <Check size={14} /> 已儲存 </> ) : ( <> <Save size={14} /> 儲存紀錄 </> )}
                </button>
            ) : (
                <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="p-1.5 text-white/60 hover:text-white transition-colors bg-white/10 rounded-full"
                title="回到頂部"
                >
                   <ArrowUp size={18} />
                </button>
            )}
        </div>
      </div>

      <div className="px-4 space-y-6">
        
        {/* Water Section */}
        <section className={`bg-white p-5 rounded-2xl shadow-sm border ${editingWaterId ? 'border-[#6E96B8] ring-1 ring-[#6E96B8]/20' : 'border-slate-100'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <Droplet className="text-[#6E96B8]" size={20} /> 
              {editingWaterId ? '編輯飲水項目' : '飲水計算'}
            </h3>
            {readOnly && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">僅檢視</span>}
          </div>
          
          <div className={`rounded-lg p-3 mb-4 border transition-opacity ${readOnly ? 'opacity-50 pointer-events-none grayscale' : ''} ${editingWaterId ? 'bg-[#6E96B8]/5 border-[#6E96B8]/20' : 'bg-slate-50 border-slate-200'}`}>
            <div className="mb-3">
              <label className="block text-xs text-slate-500 mb-2">紀錄方式</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setAddWaterType('bowl')}
                  disabled={readOnly}
                  className={`py-2 px-1 rounded-lg border transition flex flex-col items-center justify-center gap-0.5 ${
                    addWaterType === 'bowl'
                      ? 'bg-[#6E96B8] text-white border-[#6E96B8] shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-[#6E96B8]/10'
                  }`}
                >
                  <span className="text-xs font-bold">水碗紀錄</span>
                  <span className="text-[10px] opacity-80 scale-90">原始 - 剩餘</span>
                </button>
                <button
                  onClick={() => setAddWaterType('direct')}
                  disabled={readOnly}
                  className={`py-2 px-1 rounded-lg border transition flex flex-col items-center justify-center gap-0.5 ${
                    addWaterType === 'direct'
                      ? 'bg-[#6E96B8] text-white border-[#6E96B8] shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-[#6E96B8]/10'
                  }`}
                >
                  <span className="text-xs font-bold">直接飲用</span>
                  <span className="text-[10px] opacity-80 scale-90">兌/餵水</span>
                </button>
                <button
                  onClick={() => setAddWaterType('evaporation')}
                  disabled={readOnly}
                  className={`py-2 px-1 rounded-lg border transition flex flex-col items-center justify-center gap-0.5 ${
                    addWaterType === 'evaporation'
                      ? 'bg-[#6E96B8] text-white border-[#6E96B8] shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-[#6E96B8]/10'
                  }`}
                >
                  <span className="text-xs font-bold">蒸發量</span>
                  <span className="text-[10px] opacity-80 scale-90">扣除水量</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2 items-end">
              {addWaterType === 'bowl' ? (
                <>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">原始 (ml)</label>
                    <input
                      type="number"
                      value={addWaterVal1}
                      onChange={(e) => setAddWaterVal1(e.target.value)}
                      disabled={readOnly}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-base outline-none focus:ring-2 focus:ring-[#6E96B8]"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">剩餘 (ml)</label>
                    <input
                      type="number"
                      value={addWaterVal2}
                      onChange={(e) => setAddWaterVal2(e.target.value)}
                      disabled={readOnly}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-base outline-none focus:ring-2 focus:ring-[#6E96B8]"
                      placeholder="待填"
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">水量 (ml)</label>
                  <input
                    type="number"
                    value={addWaterVal1}
                    onChange={(e) => setAddWaterVal1(e.target.value)}
                    disabled={readOnly}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-base outline-none focus:ring-2 focus:ring-[#6E96B8]"
                    placeholder="0"
                  />
                </div>
              )}
              
              {!readOnly && (
                <div className="flex items-end gap-1">
                  {editingWaterId ? (
                     <>
                      <button onClick={handleAddOrUpdateWater} className="p-2 bg-[#5CA579] text-white rounded-lg hover:bg-[#4E8F67] shadow-sm h-[40px] w-[40px] flex items-center justify-center"><Check size={20} /></button>
                      <button onClick={cancelEditWater} className="p-2 bg-slate-400 text-white rounded-lg hover:bg-slate-500 shadow-sm h-[40px] w-[40px] flex items-center justify-center"><X size={20} /></button>
                     </>
                  ) : (
                    <button onClick={handleAddOrUpdateWater} className="p-2 bg-[#6E96B8] text-white rounded-lg hover:bg-[#5D84A6] shadow-sm h-[40px] w-[40px] flex items-center justify-center"><Plus size={20} /></button>
                  )}
                </div>
              )}
            </div>
            
          </div>

          <div className="space-y-4">
            {bowlGroupIntakes.length > 0 && (
               <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">
                    <GlassWater size={14} /> 水碗紀錄 <span className="text-[10px] font-normal text-slate-400">(含蒸發)</span>
                  </h4>
                  <div className="space-y-2">{bowlGroupIntakes.map(renderWaterRow)}</div>
               </div>
            )}
            {directGroupIntakes.length > 0 && (
               <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">
                    <Syringe size={14} /> 直接飲用
                  </h4>
                  <div className="space-y-2">{directGroupIntakes.map(renderWaterRow)}</div>
               </div>
            )}
            {waterIntakes.length === 0 && (
              <div className="text-center text-slate-400 text-sm py-2">尚未新增飲水</div>
            )}
          </div>
          
          {/* New Water Summary Footer */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100">
             <div className="flex flex-col items-center p-2 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 mb-0.5">食物含水</span>
                <span className="text-sm font-bold text-[#6E96B8]">{stats.foodWater.toFixed(1)} ml</span>
             </div>
             <div className="flex flex-col items-center p-2 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 mb-0.5">水碗淨攝取</span>
                <span className="text-sm font-bold text-[#6E96B8]">{bowlGroupTotal.toFixed(1)} ml</span>
             </div>
             <div className="flex flex-col items-center p-2 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 mb-0.5">直飲總計</span>
                <span className="text-sm font-bold text-[#6E96B8]">{directGroupTotal.toFixed(1)} ml</span>
             </div>
          </div>
        </section>

        {/* Food Section */}
        <section className={`bg-white p-5 rounded-2xl shadow-sm border ${editingFoodId ? 'border-[#D68C8C] ring-1 ring-[#D68C8C]/50' : 'border-slate-100'}`}>
          <div className="flex items-center justify-between mb-4">
             <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
               <Utensils className="text-[#D68C8C]" size={20} /> 
               {editingFoodId ? '編輯飲食項目' : '飲食紀錄'}
             </h3>
             {readOnly && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">僅檢視</span>}
          </div>
          
          <div className={`mb-4 transition-opacity ${readOnly ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
             <label className="block text-xs text-slate-500 mb-2">1. 選擇種類</label>
             <div className="grid grid-cols-4 gap-2 mb-3">
                {FOOD_TYPES.map(t => {
                   let activeClass = '';
                   switch(t) {
                     case '罐頭': activeClass = 'bg-[#6E96B8] text-white ring-2 ring-[#6E96B8]/30'; break;
                     case '飼料': activeClass = 'bg-[#D68C8C] text-white ring-2 ring-[#D68C8C]/30'; break;
                     case '零食': activeClass = 'bg-[#C9BBCF] text-white ring-2 ring-[#C9BBCF]/30'; break;
                   }
                   const isSelected = selectedFoodType === t;
                   return (
                     <button
                       key={t}
                       onClick={() => {
                          const nextType = isSelected ? null : t;
                          setSelectedFoodType(nextType);
                          if (nextType) {
                              const firstItem = sortedFoods.find(f => f.type === nextType);
                              if (firstItem) setSelectedFoodId(firstItem.id);
                              else setSelectedFoodId('');
                          } else {
                              setSelectedFoodId('');
                          }
                       }}
                       className={`py-2 rounded-lg text-xs font-bold transition shadow-sm ${
                         isSelected ? activeClass : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                       }`}
                     >
                       {t}
                     </button>
                   );
                })}
             </div>

             <label className="block text-xs text-slate-500 mb-2">2. 選擇內容與克數</label>
             <div className="flex gap-2">
                <div className="flex-1 relative">
                    <button
                        onClick={() => {
                            if (!selectedFoodType) {
                                alert("請先選擇上方的食物種類");
                                return;
                            }
                            setIsFoodDropdownOpen(!isFoodDropdownOpen);
                        }}
                        disabled={readOnly}
                        className={`w-full p-2.5 bg-white border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#D68C8C] text-left flex justify-between items-center ${
                            !selectedFoodType ? 'border-slate-100 text-slate-300 cursor-not-allowed' : 'border-slate-200 text-slate-700'
                        }`}
                    >
                        {selectedFood ? selectedFood.name : (selectedFoodType ? `選擇${selectedFoodType}...` : '請先選擇種類')}
                        <ChevronDown size={16} className="text-slate-400 shrink-0" />
                    </button>

                    {isFoodDropdownOpen && !readOnly && selectedFoodType && (
                        <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsFoodDropdownOpen(false)}></div>
                        <div className="absolute z-20 top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                            {availableFoods.length === 0 ? (
                                <div className="p-3 text-xs text-slate-400 text-center">無此類別食物</div>
                            ) : (
                                availableFoods.map(f => (
                                <div 
                                    key={f.id} 
                                    onClick={() => {
                                        setSelectedFoodId(f.id);
                                        setIsFoodDropdownOpen(false);
                                    }}
                                    className={`p-3 cursor-pointer flex items-center justify-between text-sm transition hover:bg-[#D68C8C]/20 border-b border-slate-50 last:border-0 ${selectedFoodId === f.id ? 'bg-[#D68C8C]/30' : ''}`}
                                >
                                    <span className="font-medium text-slate-700 flex items-center gap-1">
                                        {f.name}
                                        {f.isDefault && <Star size={12} className="fill-yellow-400 text-yellow-400 ml-1" />}
                                    </span>
                                </div>
                                ))
                            )}
                        </div>
                        </>
                    )}
                </div>
                
                <div className="w-24">
                    <input
                        type="number"
                        value={foodAmount}
                        onChange={(e) => setFoodAmount(e.target.value)}
                        placeholder="0"
                        disabled={readOnly}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-base outline-none focus:ring-2 focus:ring-[#D68C8C]"
                    />
                </div>
                {!readOnly && (
                    <div className="flex items-end gap-1">
                        {editingFoodId ? (
                        <>
                            <button onClick={handleAddOrUpdateFood} className="p-2.5 bg-[#5CA579] text-white rounded-lg hover:bg-[#4E8F67] shadow-sm active:scale-95"><Check size={20} /></button>
                            <button onClick={cancelEditFood} className="p-2.5 bg-slate-400 text-white rounded-lg hover:bg-slate-500 shadow-sm active:scale-95"><X size={20} /></button>
                        </>
                        ) : (
                        <button onClick={handleAddOrUpdateFood} className="p-2.5 bg-[#D68C8C] text-white rounded-lg hover:bg-[#D9AFAF] shadow-sm active:scale-95"><Plus size={20} /></button>
                        )}
                    </div>
                )}
             </div>
          </div>
          
          <div className="space-y-4">
            {mainFoodIntakes.length > 0 && (
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">
                  <Soup size={14} /> 主食 <span className="text-[10px] font-normal text-slate-400">(罐頭、飼料)</span>
                </h4>
                <div className="space-y-2">{mainFoodIntakes.map(renderIntakeRow)}</div>
              </div>
            )}
            {sideFoodIntakes.length > 0 && (
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">
                  <Cookie size={14} /> 零食 
                  {calorieAnalysis.ratio > 0 && (
                     calorieAnalysis.isHighRatio ? (
                       <span className="text-[10px] px-1.5 py-0.5 rounded ml-1 bg-yellow-50 text-yellow-800 border border-yellow-200 font-bold flex items-center gap-1">
                          <AlertTriangle size={10} />
                          佔 {calorieAnalysis.ratio.toFixed(1)}% (建議 &lt; 10%)
                       </span>
                     ) : (
                       <span className="text-[10px] px-1.5 py-0.5 rounded ml-1 bg-slate-100 text-slate-500">
                          佔 {calorieAnalysis.ratio.toFixed(1)}%
                       </span>
                     )
                  )}
                </h4>
                <div className="space-y-2">{sideFoodIntakes.map(renderIntakeRow)}</div>
              </div>
            )}
            {foodIntakes.length === 0 && (
               <div className="text-center text-slate-400 text-sm py-2">尚未新增飲食</div>
            )}
          </div>
          
        </section>

        {/* Excretion & Weight */}
        <section className={`bg-white p-5 rounded-2xl shadow-sm border border-slate-100 transition-opacity ${readOnly ? 'opacity-80' : ''}`}>
          <div className="flex items-center justify-between mb-4">
             <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
               <Activity className="text-[#C9BBCF]" size={20} /> 生理狀況
             </h3>
             {readOnly && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">僅檢視</span>}
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">尿塊大小 (拉桿)</label>
            <input 
              type="range" 
              min="0" 
              max="4" 
              step="0.5"
              value={currentSliderValue}
              onChange={(e) => setUrineSize(getUrineLabelFromValue(parseFloat(e.target.value)))}
              disabled={readOnly}
              className={`w-full h-2 bg-[#C9BBCF]/30 rounded-lg appearance-none cursor-pointer accent-[#C9BBCF] ${readOnly ? 'cursor-not-allowed opacity-50' : ''}`}
            />
            <div className="flex justify-between text-xs text-slate-400 mt-2">
              {URINE_ANCHORS.map((size) => (
                <span key={size} className={`${urineSize === size ? 'text-[#C9BBCF] font-bold' : ''}`}>
                  {size}
                </span>
              ))}
            </div>
            <div className="mt-2 text-center text-[#C9BBCF] font-medium h-6">
              {urineSize}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">大便狀態</label>
            <div className="grid grid-cols-4 gap-2">
              {STOOL_STATUSES.map(status => (
                <button
                  key={status}
                  onClick={() => setStoolStatus(status)}
                  disabled={readOnly}
                  className={`py-2 px-1 text-xs rounded-lg border transition ${
                    stoolStatus === status 
                      ? 'bg-[#C9BBCF] text-white border-[#C9BBCF]' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-[#C9BBCF]/20'
                  } ${readOnly ? 'cursor-not-allowed opacity-70 hover:bg-white' : ''}`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
             <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
               <Scale size={16} /> 體重 (kg)
             </label>
             <input
                type="number"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                disabled={readOnly}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-base outline-none focus:ring-2 focus:ring-[#C9BBCF]"
                placeholder="例如: 5.8"
              />
          </div>

           <div className="relative">
             <label className="block text-sm font-medium text-slate-700 mb-2 flex justify-between items-center">
                 備註 (複選)
             </label>
             
             {/* Note Buttons Grid */}
             <div className="grid grid-cols-5 gap-2">
                {/* 1. Edit Button */}
                <button
                   onClick={() => !readOnly && setIsNoteEditModalOpen(true)}
                   disabled={readOnly}
                   className={`h-10 flex items-center justify-center rounded-lg border transition ${readOnly ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-100' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
                >
                    <SettingsIcon size={16} />
                </button>

                {/* 2. Preset Buttons */}
                {presets.map(note => (
                    <button
                        key={note}
                        onClick={() => toggleNote(note)}
                        disabled={readOnly}
                        className={`h-10 px-1 flex items-center justify-center rounded-lg border transition text-xs font-medium truncate ${
                            currentNotes.includes(note)
                                ? 'bg-[#C9BBCF] text-white border-[#C9BBCF] shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-[#C9BBCF]/20'
                        } ${readOnly ? 'cursor-not-allowed opacity-70 hover:bg-white' : ''}`}
                        title={note}
                    >
                        {note}
                    </button>
                ))}
             </div>
             
             {/* Edit Modal */}
             {isNoteEditModalOpen && (
                 <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
                     <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                             <h3 className="font-bold text-slate-700">編輯備註選項</h3>
                             <button onClick={() => setIsNoteEditModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="flex gap-2 mb-4">
                                <input 
                                    type="text"
                                    value={presetInput}
                                    onChange={(e) => setPresetInput(e.target.value)}
                                    placeholder="新增選項..."
                                    className="flex-1 p-2 text-base bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#C9BBCF]"
                                    onKeyDown={(e) => e.key === 'Enter' && addPreset()}
                                />
                                <button 
                                    onClick={addPreset}
                                    className="p-2 bg-[#C9BBCF] text-white rounded-lg hover:bg-[#A99BAF] shrink-0"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                            
                            <div className="space-y-2">
                                {presets.map((preset, index) => (
                                    <div key={preset} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <span className="text-sm font-medium text-slate-700">{preset}</span>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={() => movePreset(index, 'up')}
                                                disabled={index === 0}
                                                className="p-1.5 text-slate-400 hover:text-[#C9BBCF] disabled:opacity-20 hover:bg-white rounded"
                                            >
                                                <ArrowUp size={16} />
                                            </button>
                                            <button 
                                                onClick={() => movePreset(index, 'down')}
                                                disabled={index === presets.length - 1}
                                                className="p-1.5 text-slate-400 hover:text-[#C9BBCF] disabled:opacity-20 hover:bg-white rounded"
                                            >
                                                <ArrowDown size={16} />
                                            </button>
                                            <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                            <button 
                                                onClick={() => removePreset(preset)}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {presets.length === 0 && <div className="text-center text-slate-400 py-4 text-sm">暫無選項</div>}
                            </div>
                        </div>
                     </div>
                 </div>
             )}
          </div>
        </section>

        {existingRecord && onDelete && !readOnly && (
            <div className="mt-4 pt-6 border-t border-slate-200 pb-4">
                {showDeleteConfirm ? (
                    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 bg-red-50 p-4 rounded-xl border border-red-100">
                        <p className="text-center text-sm text-red-600 font-bold mb-1">
                            ⚠️ 確定要刪除 {date} 的紀錄嗎？
                            <span className="block text-xs font-normal opacity-80 mt-1">此動作無法復原。</span>
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 text-slate-600 bg-white border border-slate-200 rounded-xl font-medium shadow-sm hover:bg-slate-50 transition">取消</button>
                            <button onClick={handleDelete} className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 rounded-xl font-bold shadow-md transition active:scale-95">確認刪除</button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setShowDeleteConfirm(true)} className="w-full flex items-center justify-center gap-2 py-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition text-sm font-medium">
                        <Trash size={16} /> 刪除此日紀錄
                    </button>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default DailyEntry;