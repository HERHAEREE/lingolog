import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDiaryRepository } from './diary-repository';

export function createLocalDiaryRepository() {
  return createDiaryRepository(AsyncStorage);
}
