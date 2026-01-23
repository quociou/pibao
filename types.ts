export type FoodType = '飼料' | '罐頭' | '零食';

export interface FoodDef {
  id: string;
  name: string;
  type: FoodType;
  caloriesPerGram: number; // kcal/g
  waterContentPercent: number; // % (0-100)
  order?: number; // Display order
  isDefault?: boolean; // Is this the default food for new days?
  defaultAmount?: number; // Default amount in grams to pre-fill
}

// Changed to string to allow intermediate values like "1元 ~ 50元"
export type UrineSize = string; 
export type StoolStatus = '正常' | '未大便' | '顆粒狀' | '稀便';

export interface FoodIntake {
  id: string;
  foodId: string;
  amount: number; // grams
}

export type WaterIntakeType = 'bowl' | 'direct' | 'evaporation';

export interface WaterIntake {
  id: string;
  type: WaterIntakeType;
  amount1: number; // Original for bowl, Amount for direct/evaporation
  amount2: number | null; // Leftover for bowl (null if not set yet), 0 for others
  evaporation?: number; // Deprecated: Kept for legacy records
}

export interface DailyRecord {
  id: string;
  date: string; // YYYY-MM-DD
  weight: number; // kg
  
  // Eating
  foodIntakes: FoodIntake[];
  
  // Drinking logic (Updated to list-based)
  waterIntakes: WaterIntake[];
  
  // Excretion
  urineSize: UrineSize;
  urineCount: number; 
  stoolStatus: StoolStatus;
  
  // Other
  notes: string;
}

// Helper interface for display
export interface DailySummary {
  date: string;
  totalCalories: number;
  totalWater: number;
  weight: number;
  urineSize: string;
  stoolStatus: string;
}

export interface AppSettings {
  targetWeight: number; // kg
  activityFactor: number; // 0.8 | 0.9 | 1.0 | 1.1 | 1.2
  defaultEvaporation: number; // ml
  notePresets?: string[];
  litterInterval?: number; // Days between litter changes
  medicationInterval?: number; // Days between medication
}