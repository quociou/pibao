
import { DailyRecord, FoodDef, WaterIntake, AppSettings } from '../types';
import { db } from './firebase';
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';

// Initial data for seeding if DB is empty
// Updated: Merged '副食' into '零食'
const INITIAL_FOODS: FoodDef[] = [
  { id: 'f1', name: '雞肉燉菜', type: '罐頭', caloriesPerGram: 0.841, waterContentPercent: 85, order: 0 },
  { id: 'f2', name: '鮪魚燉菜', type: '罐頭', caloriesPerGram: 0.805, waterContentPercent: 84, order: 1 },
  // Set c/d stress as default with 30g to match previous hardcoded behavior for new databases
  { id: 'f3', name: 'c/d stress', type: '飼料', caloriesPerGram: 3.895, waterContentPercent: 8, order: 2, isDefault: true, defaultAmount: 30 },
  { id: 'f4', name: 'LP34', type: '飼料', caloriesPerGram: 3.872, waterContentPercent: 7, order: 3 },
  { id: 'f5', name: 'LP34W', type: '罐頭', caloriesPerGram: 0.816, waterContentPercent: 80.5, order: 4 },
  { id: 'f6', name: '豹放鬆', type: '零食', caloriesPerGram: 2.0, waterContentPercent: 60.5, order: 5 },
  { id: 'f7', name: '雞胸肉', type: '零食', caloriesPerGram: 1.19, waterContentPercent: 60, order: 6 },
];

const DEFAULT_NOTE_PRESETS = ['換砂', '洗飼料機', '點藥', '就醫', '健檢', '咳嗽', '嘔吐', '舔嘴唇', '精神差', '食慾差', '肚子翻攪'];

// Helper to remove undefined fields which Firestore doesn't like
const sanitizeForFirestore = <T extends object>(data: T): T => {
  const cleanData = { ...data };
  Object.keys(cleanData).forEach(key => {
    if ((cleanData as any)[key] === undefined) {
      delete (cleanData as any)[key];
    }
  });
  return cleanData;
};

// --- Settings Operations ---

export const fetchSettings = async (): Promise<AppSettings> => {
  try {
    const docRef = doc(db, "settings", "global");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as AppSettings;
      // Ensure notePresets exists (migration)
      if (!data.notePresets || data.notePresets.length === 0) {
          data.notePresets = DEFAULT_NOTE_PRESETS;
      }
      return data;
    } else {
      // Default settings
      const defaultSettings: AppSettings = {
        targetWeight: 5.0,
        activityFactor: 1.0,
        defaultEvaporation: 0,
        notePresets: DEFAULT_NOTE_PRESETS,
        litterInterval: 14, // Default to 14 days
        medicationInterval: 30, // Default to 30 days
        feederInterval: 30 // Default to 30 days
      };
      await setDoc(docRef, sanitizeForFirestore(defaultSettings));
      return defaultSettings;
    }
  } catch (error) {
    console.error("Error fetching settings:", error);
    // Return safe default if offline or error
    return {
        targetWeight: 5.0,
        activityFactor: 1.0,
        defaultEvaporation: 0,
        notePresets: DEFAULT_NOTE_PRESETS,
        litterInterval: 14,
        medicationInterval: 30,
        feederInterval: 30
    };
  }
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  try {
    const docRef = doc(db, "settings", "global");
    await setDoc(docRef, sanitizeForFirestore(settings));
  } catch (error) {
    console.error("Error saving settings:", error);
    throw error;
  }
};

// --- Food Operations ---

export const fetchFoods = async (): Promise<FoodDef[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, "foods"));
    if (querySnapshot.empty) {
      // Seed initial data
      const batch = writeBatch(db);
      INITIAL_FOODS.forEach(f => {
        batch.set(doc(db, "foods", f.id), sanitizeForFirestore(f));
      });
      await batch.commit();
      return INITIAL_FOODS;
    }
    
    const foods: FoodDef[] = [];
    querySnapshot.forEach(doc => {
      foods.push(doc.data() as FoodDef);
    });
    return foods.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (error) {
    console.error("Error fetching foods:", error);
    return [];
  }
};

export const saveFoodToRemote = async (food: FoodDef, allFoods?: FoodDef[]): Promise<void> => {
  try {
    await setDoc(doc(db, "foods", food.id), sanitizeForFirestore(food));
  } catch (error) {
    console.error("Error saving food:", error);
    throw error;
  }
};

export const deleteFoodFromRemote = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "foods", id));
  } catch (error) {
    console.error("Error deleting food:", error);
    throw error;
  }
};

export const saveFoodsOrderToRemote = async (foods: FoodDef[]): Promise<void> => {
  try {
    const batch = writeBatch(db);
    foods.forEach(f => {
      const ref = doc(db, "foods", f.id);
      batch.update(ref, { order: f.order });
    });
    await batch.commit();
  } catch (error) {
    console.error("Error updating food order:", error);
    throw error;
  }
};

// --- Record Operations ---

export const fetchRecords = async (): Promise<DailyRecord[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, "records"));
    const records: DailyRecord[] = [];
    querySnapshot.forEach(doc => {
      records.push(doc.data() as DailyRecord);
    });
    return records;
  } catch (error) {
    console.error("Error fetching records:", error);
    return [];
  }
};

export const saveRecordToRemote = async (record: DailyRecord): Promise<void> => {
  try {
    // Automatically update lastModified timestamp
    const updatedRecord = {
        ...record,
        lastModified: Date.now()
    };
    await setDoc(doc(db, "records", record.id), sanitizeForFirestore(updatedRecord));
  } catch (error) {
    console.error("Error saving record:", error);
    throw error;
  }
};

// Batch update to mark records as backed up
export const markRecordsAsBackedUp = async (recordIds: string[]): Promise<void> => {
    try {
        const batch = writeBatch(db);
        const now = Date.now();
        recordIds.forEach(id => {
            const ref = doc(db, "records", id);
            batch.update(ref, { lastBackupTime: now });
        });
        await batch.commit();
    } catch (error) {
        console.error("Error marking records as backed up:", error);
        throw error;
    }
};

export const deleteRecordFromRemote = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "records", id));
  } catch (error) {
    console.error("Error deleting record:", error);
    throw error;
  }
};

// --- Calculation Helper ---

export const calculateDailyStats = (record: DailyRecord, foods: FoodDef[]) => {
  let totalCalories = 0;
  let sideCalories = 0;
  let foodWater = 0;
  let drinkWater = 0;

  // Food Stats
  if (record.foodIntakes) {
    record.foodIntakes.forEach(intake => {
      const food = foods.find(f => f.id === intake.foodId);
      if (food) {
        const cals = intake.amount * food.caloriesPerGram;
        totalCalories += cals;
        
        // Handle legacy '副食' by treating it as '零食'
        // Type casting to string to safely check legacy types
        const typeStr = food.type as string;
        if (typeStr === '零食' || typeStr === '副食') {
          sideCalories += cals;
        }

        const water = intake.amount * (food.waterContentPercent / 100);
        foodWater += water;
      }
    });
  }

  // Water Stats
  if (record.waterIntakes) {
    record.waterIntakes.forEach(w => {
       if (w.type === 'bowl') {
          if (w.amount2 !== null && w.amount2 !== undefined) {
             const evap = w.evaporation || 0;
             const consumed = Math.max(0, w.amount1 - w.amount2 - evap);
             drinkWater += consumed;
          }
       } else if (w.type === 'direct') {
          drinkWater += w.amount1;
       } else if (w.type === 'evaporation') {
          drinkWater -= w.amount1;
       }
    });
  }

  return {
    totalCalories,
    sideCalories,
    foodWater,
    totalWater: foodWater + drinkWater,
    drinkWater
  };
};
